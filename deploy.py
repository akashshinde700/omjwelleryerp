"""
OmGold ERP -- deploy this repo to the CloudPanel-managed VPS
(www.aetherdevsolutions.online, 200.141.9.196).

Next.js 16 app (App Router, Prisma + MySQL, NextAuth v4) built with
`output: "standalone"`. It is compiled ON THE SERVER and run as
`.next/standalone/server.js` under PM2 as the CloudPanel site user, on the
port the site's nginx vhost proxies to (read from the vhost as root).

Database: the CloudPanel MySQL database `jwellery` (user `aetherjwellery`,
127.0.0.1:3306). Schema is applied with `prisma migrate deploy` (non-
destructive). The seed runs only when the database has no users yet, or when
--seed is passed.

Two env surfaces: `.env` is read by Next and Prisma during the build; the PM2
ecosystem file carries the same values as real env vars, because standalone
`server.js` does NOT read .env files at runtime.

  !!  DESTRUCTIVE  !!
  Step 4 wipes the site's htdocs and re-uploads this repo. MySQL data is not
  touched by the wipe.

Run:
  python deploy.py                # upload, build, migrate, start
  python deploy.py --fresh-db     # backup, DROP all tables, migrate + seed
  python deploy.py --seed         # also run prisma/seed.ts (adds demo data)
  python deploy.py --no-build     # re-upload + restart only
"""

import json
import os
import re
import sys
import time
import posixpath
from urllib.parse import quote

import paramiko

os.environ["PYTHONIOENCODING"] = "utf-8"
os.environ["PYTHONUNBUFFERED"] = "1"

LOCAL_ROOT  = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(LOCAL_ROOT, "deploy_config.json")

ARGS      = sys.argv[1:]
FRESH_DB  = "--fresh-db" in ARGS                # backup, drop all tables, migrate + seed
FORCE_SEED = "--seed" in ARGS
RUN_BUILD = "--no-build" not in ARGS

# -- Credentials ----------------------------------------------
# deploy_config.json (optional) overrides any key without editing this file.
CFG = {
    # SECRETS LIVE IN deploy_config.json (git-ignored, never uploaded) -- NOT in this file.
    # They were in source until 2026-10-24; sec-appsec F1. Required keys: host, root_user,
    # root_password, site_user, site_password, site_domain, app_port, pm2_name, app_url,
    # db_host, db_port, db_name, db_user, db_password, nextauth_secret.
    "app_port": 0,
    "pm2_name": "omgold-erp",
    "db_host":  "127.0.0.1",
    "db_port":  3306,
}

if not os.path.exists(CONFIG_PATH):
    sys.exit(f"[ERROR] {CONFIG_PATH} is required -- it holds the server and DB credentials.")
with open(CONFIG_PATH, "r", encoding="utf-8") as _f:
    CFG.update(json.load(_f))
_missing = [k for k in ("host", "root_user", "root_password", "site_user", "site_password",
                        "site_domain", "app_url", "db_name", "db_user", "db_password",
                        "nextauth_secret") if not CFG.get(k)]
if _missing:
    sys.exit(f"[ERROR] deploy_config.json is missing: {', '.join(_missing)}")

HOST          = CFG["host"]
SITE_USER     = CFG["site_user"]
SITE_PASSWORD = CFG["site_password"]
SITE_DOMAIN   = CFG["site_domain"]
PM2_NAME      = CFG["pm2_name"]
APP_URL       = CFG["app_url"]

DATABASE_URL = (
    f"mysql://{quote(CFG['db_user'], safe='')}:{quote(CFG['db_password'], safe='')}"
    f"@{CFG['db_host']}:{CFG['db_port']}/{CFG['db_name']}"
)

NVM_DIR  = "/home/" + SITE_USER + "/.nvm"
NVM_INIT = 'export NVM_DIR="' + NVM_DIR + '"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

SITE_HOME  = f"/home/{SITE_USER}"
REMOTE_APP = f"{SITE_HOME}/htdocs/{SITE_DOMAIN}"

SKIP_DIRS = {
    "node_modules", ".next", ".next-test", ".next-authcheck", ".git", ".github",
    "__pycache__", "out", "build", "coverage", "test-results", "playwright-report",
    ".playwright", "e2e", "tests", ".vscode", ".qodo", ".claude", ".codegraph",
    "backups", "tool-results", "db", "agent-ctx", "mini-services", ".zscripts",
    ".zscripts-backup", "mobile", "electron", "upload", "download", ".auth",
}
SKIP_FILES = {
    "deploy.py", "deploy_config.json", ".env", ".env.local", ".env.production",
    "dev.log", "server.log", "worklog.md", "bun.lock",
}
SKIP_EXTS = {".log", ".pid", ".tsbuildinfo"}


def _env_line(k, v):
    v = str(v)
    return f'{k}={json.dumps(v)}' if (v == "" or any(c in v for c in ' "#\n')) else f"{k}={v}"


def build_env(port):
    return [
        "NODE_ENV=production",
        f"PORT={port}",
        "HOSTNAME=127.0.0.1",
        _env_line("DATABASE_URL", DATABASE_URL),
        _env_line("NEXTAUTH_URL", APP_URL),
        _env_line("NEXTAUTH_SECRET", CFG["nextauth_secret"]),
    ]


def ecosystem(env_lines):
    env = {}
    for ln in env_lines:
        k, v = ln.split("=", 1)
        env[k] = json.loads(v) if v.startswith('"') else v
    return (
        "// PM2 config -- Next.js standalone server. server.js does not load .env.\n"
        "module.exports = " + json.dumps({
            "apps": [{
                "name": PM2_NAME,
                "cwd": f"{REMOTE_APP}/.next/standalone",
                "script": "server.js",
                "instances": 1,
                "exec_mode": "fork",
                "autorestart": True,
                "max_restarts": 10,
                "restart_delay": 4000,
                "max_memory_restart": "800M",
                "env": env,
            }]
        }, indent=2) + ";\n"
    )


# -- helpers --------------------------------------------------
def p(text):
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "ascii"
        print(str(text).encode(enc, "replace").decode(enc), flush=True)


def banner(title):
    p("\n" + "=" * 64 + f"\n{title}\n" + "=" * 64)


def safe_print(b):
    if isinstance(b, bytes):
        b = b.decode("utf-8", "replace")
    print(b.encode("ascii", "replace").decode("ascii"), end="", flush=True)


def run(ssh, command, timeout=600, check=False, quiet=False, show=None):
    if not quiet:
        p(f"\n[CMD] {show or command}")
    _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    out = stdout.read()
    err = stderr.read()
    code = stdout.channel.recv_exit_status()
    if not quiet:
        safe_print(out)
        if err:
            safe_print(err)
        p(f"[exit {code}]")
    if check and code != 0:
        raise RuntimeError(f"remote command failed ({code}): {show or command}")
    return out.decode("utf-8", "replace"), err.decode("utf-8", "replace"), code


def run_site(ssh, command, timeout=600, check=False, show=None):
    return run(ssh, f'{NVM_INIT}; {command}', timeout=timeout, check=check, show=show)


def connect(user, pw):
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username=user, password=pw, timeout=30,
              look_for_keys=False, allow_agent=False)
    return c


def sftp_mkdirs(sftp, remote_dir):
    parts, cur = remote_dir.strip("/").split("/"), ""
    for part in parts:
        cur += "/" + part
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)


def upload_string(sftp, content, remote_path):
    sftp_mkdirs(sftp, posixpath.dirname(remote_path))
    with sftp.open(remote_path, "wb") as f:
        f.write(content.encode("utf-8"))
    p(f"  written : {remote_path}")


def upload_tree(sftp, local_dir, remote_dir):
    count = 0
    sftp_mkdirs(sftp, remote_dir)
    for root, dirs, files in os.walk(local_dir):
        # .next-test-1, .next-test-2 ... are per-slot Playwright build dirs; a running test
        # server holds a lock file in them that Windows refuses to read.
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".next")]
        rel = os.path.relpath(root, local_dir)
        rdir = remote_dir if rel == "." else remote_dir + "/" + rel.replace(os.sep, "/")
        if rel != ".":
            try:
                sftp.stat(rdir)
            except FileNotFoundError:
                sftp.mkdir(rdir)
        for fn in files:
            if fn in SKIP_FILES or os.path.splitext(fn)[1] in SKIP_EXTS:
                continue
            local = os.path.join(root, fn)
            remote = rdir + "/" + fn
            # Windows can run out of socket buffer space (WinError 10055) on
            # many rapid puts; back off and retry.
            for attempt in range(4):
                try:
                    sftp.put(local, remote)
                    break
                except OSError as ex:
                    if attempt == 3:
                        raise
                    p(f"  [retry {attempt + 1}] {fn}: {ex}")
                    time.sleep(1.5 * (attempt + 1))
            count += 1
            if count % 100 == 0:
                p(f"  ... {count} files")
    p(f"  {count} files -> {remote_dir}")
    return count


def detect_port():
    """Read the reverse-proxy port from the site's nginx vhost as root."""
    if int(CFG.get("app_port") or 0):
        return int(CFG["app_port"]), None
    ssh = connect(CFG["root_user"], CFG["root_password"])
    try:
        conf = f"/etc/nginx/sites-enabled/{SITE_DOMAIN}.conf"
        out, _, _ = run(ssh, f"cat {conf} 2>/dev/null", quiet=True)
        m = re.search(r"proxy_pass\s+https?://(?:127\.0\.0\.1|localhost):(\d+)", out)
        if m:
            return int(m.group(1)), out
        return None, out
    finally:
        ssh.close()


# -- main -----------------------------------------------------
def main():
    banner(f"Deploy OmGold ERP -> https://{SITE_DOMAIN}  ({HOST}, CloudPanel)")

    if not os.path.isfile(os.path.join(LOCAL_ROOT, "next.config.ts")):
        p("[ERROR] run this from the repo root (next.config.ts not found).")
        sys.exit(1)

    banner("[0] Reading app port from nginx vhost (root)")
    port, vhost = detect_port()
    if not port:
        p("[ERROR] no proxy_pass to 127.0.0.1:<port> in this site's vhost -- it is not a "
          "Node.js site. Recreate it in CloudPanel as a Node.js site, or set app_port "
          "in deploy_config.json. Vhost was:\n" + (vhost or "(not found)")[:3000])
        sys.exit(1)
    p(f"  app port: {port}")

    env_lines = build_env(port)
    env_content = "\n".join(env_lines) + "\n"

    p(f"  repo    : {LOCAL_ROOT}")
    p(f"  user    : {SITE_USER}")
    p(f"  DB      : mysql {CFG['db_user']}@{CFG['db_host']}:{CFG['db_port']}/{CFG['db_name']}")
    p(f"  build   : {'yes' if RUN_BUILD else 'no'}")

    p(f"\n[CONNECT] {SITE_USER}@{HOST}")
    ssh = connect(SITE_USER, SITE_PASSWORD)
    p("[OK]")
    try:
        # -- Step 1: toolchain -------------------------------
        banner("[1] Node / npm / pm2")
        nv, _, _ = run_site(ssh, "node -v; npm -v; which pm2 || npm i -g pm2", timeout=900)
        major = 0
        for tok in nv.split():
            if tok.startswith("v") and tok[1:].split(".")[0].isdigit():
                major = int(tok[1:].split(".")[0])
                break
        if not major:
            raise RuntimeError("node not found for the site user -- set the Node version in CloudPanel.")
        if major < 20:
            raise RuntimeError(f"server node is v{major} -- Next 16 needs Node >= 20.9.")

        # -- Step 2: database reachable ----------------------
        banner("[2] MySQL connectivity")
        _, _, dc = run(ssh,
                       f"mysql -h{CFG['db_host']} -P{CFG['db_port']} -u{CFG['db_user']} "
                       f"-p'{CFG['db_password']}' {CFG['db_name']} -e 'select 1' ",
                       show=f"mysql ... {CFG['db_name']} -e 'select 1'")
        if dc != 0:
            raise RuntimeError("cannot log in to MySQL with the configured db_user/db_password.")

        # Always keep a dump before touching the schema.
        mysql_auth = (f"-h{CFG['db_host']} -P{CFG['db_port']} -u{CFG['db_user']} "
                      f"-p'{CFG['db_password']}'")
        dump = f"{SITE_HOME}/backups/{CFG['db_name']}-$(date +%Y%m%d-%H%M%S).sql"
        run(ssh, f"mkdir -p {SITE_HOME}/backups && mysqldump --no-tablespaces {mysql_auth} "
                 f"{CFG['db_name']} 2>/dev/null > {dump} && ls -la {SITE_HOME}/backups | tail -3",
            check=True, show=f"mysqldump {CFG['db_name']} > {dump}")

        if FRESH_DB:
            banner("[2b] --fresh-db: dropping every table in the database")
            run(ssh,
                f"T=$(mysql {mysql_auth} -N {CFG['db_name']} -e \"select group_concat(concat('\\`',"
                f"table_name,'\\`')) from information_schema.tables where table_schema='{CFG['db_name']}'\" "
                f"2>/dev/null); if [ -n \"$T\" ] && [ \"$T\" != NULL ]; then mysql {mysql_auth} "
                f"{CFG['db_name']} -e \"SET FOREIGN_KEY_CHECKS=0; DROP TABLE $T;\" 2>/dev/null; fi; "
                f"echo tables left: $(mysql {mysql_auth} -N -e \"select count(*) from "
                f"information_schema.tables where table_schema='{CFG['db_name']}'\" 2>/dev/null)",
                check=True, show="DROP all tables (FOREIGN_KEY_CHECKS=0)")

        # -- Step 3: stop current app ------------------------
        banner("[3] Stopping the currently-deployed app")
        run_site(ssh, f"pm2 delete {PM2_NAME} 2>/dev/null; true")
        time.sleep(2)

        # -- Step 4: wipe htdocs, upload source ---------------
        banner("[4] Wiping htdocs and uploading source")
        run_site(ssh, f"rm -rf {REMOTE_APP} && mkdir -p {REMOTE_APP}", check=True)
        sftp = ssh.open_sftp()
        try:
            n = upload_tree(sftp, LOCAL_ROOT, REMOTE_APP)
            if n < 20:
                raise RuntimeError(f"only {n} files uploaded -- aborting")
            banner("[5] Writing .env + ecosystem.config.js")
            upload_string(sftp, env_content, f"{REMOTE_APP}/.env")
            upload_string(sftp, ecosystem(env_lines), f"{REMOTE_APP}/ecosystem.config.js")
        finally:
            sftp.close()
        run_site(ssh, f"chmod 600 {REMOTE_APP}/.env {REMOTE_APP}/ecosystem.config.js")

        senv = f"set -a; . {REMOTE_APP}/.env; set +a;"

        # -- Step 6-8: install, migrate, build ----------------
        if RUN_BUILD:
            banner("[6] npm ci")
            run_site(ssh, f"cd {REMOTE_APP} && npm ci --no-audit --no-fund 2>&1 | tail -20; "
                          f"test -d node_modules/next",
                     timeout=1800, check=True)

            banner("[7] prisma generate + migrate deploy")
            run_site(ssh, f"cd {REMOTE_APP} && npx prisma generate 2>&1 | tail -5",
                     timeout=600, check=True)
            _, _, pc = run_site(ssh, f"cd {REMOTE_APP} && npx prisma migrate deploy 2>&1 | tail -40; "
                                     f"exit ${{PIPESTATUS[0]}}", timeout=900)
            if pc != 0:
                raise RuntimeError("prisma migrate deploy failed -- aborting before start")

            banner("[8] next build (output: standalone)")
            run_site(ssh, f"cd {REMOTE_APP} && rm -rf .next && "
                          f"NODE_OPTIONS=--max-old-space-size=3072 npx next build 2>&1 | tail -40; "
                          f"test -f .next/standalone/server.js",
                     timeout=2400, check=True)

            banner("[8b] Assembling standalone server")
            run_site(ssh, f"cd {REMOTE_APP} && "
                          f"mkdir -p .next/standalone/.next .next/standalone/node_modules && "
                          f"cp -r .next/static .next/standalone/.next/ && "
                          f"cp -r public .next/standalone/ && "
                          f"cp -r node_modules/.prisma .next/standalone/node_modules/ && "
                          f"cp -r node_modules/@prisma .next/standalone/node_modules/ && "
                          f"echo '[OK] standalone assembled'", timeout=600, check=True)
        else:
            banner("[6-8] --no-build: skipping")

        # -- Step 9: seed ------------------------------------
        out, _, _ = run(ssh,
                        f"mysql -h{CFG['db_host']} -P{CFG['db_port']} -u{CFG['db_user']} "
                        f"-p'{CFG['db_password']}' {CFG['db_name']} -N -e 'select count(*) from User' 2>/dev/null",
                        show="mysql ... select count(*) from User")
        users = int(out.strip()) if out.strip().isdigit() else 0
        if FORCE_SEED or users == 0:
            banner("[9] prisma/seed.ts")
            run_site(ssh, f"cd {REMOTE_APP} && {senv} NODE_ENV=development "
                          f"npx --yes tsx prisma/seed.ts 2>&1 | tail -30", timeout=900)
        else:
            p(f"[INFO] {users} users already present -- seed skipped")

        # -- Step 10: start under PM2 -------------------------
        banner("[10] PM2 start")
        run_site(ssh, f"cd {REMOTE_APP} && pm2 start ecosystem.config.js 2>&1 | cat", check=True)
        run_site(ssh, "pm2 save 2>&1 | cat")

        # -- Step 11: health check ----------------------------
        banner("[11] Health check")
        time.sleep(8)
        run_site(ssh, "pm2 list 2>&1 | cat")
        run_site(ssh, f"pm2 logs {PM2_NAME} --lines 25 --nostream 2>&1 | cat || true")
        out, _, _ = run(ssh, f"curl -s -o /dev/null -w '%{{http_code}}' --max-time 30 "
                             f"http://127.0.0.1:{port}/ || true")
        p(f"[local]  GET 127.0.0.1:{port}/  -> {out.strip() or 'no response'}")
        out, _, _ = run(ssh, f"curl -sk -o /dev/null -w '%{{http_code}}' --max-time 30 "
                             f"https://{SITE_DOMAIN}/ || true")
        p(f"[public] GET https://{SITE_DOMAIN}/  -> {out.strip() or 'no response'}")

        banner("[DONE]")
        p(f"  URL : {APP_URL}")
        p(f"  App : {REMOTE_APP}  (port {port}, pm2 '{PM2_NAME}')")

    except Exception as e:
        p(f"\n[ERROR] Deploy failed: {e}")
        sys.exit(1)
    finally:
        ssh.close()
        p("\n[INFO] SSH closed.")

    # Reboot persistence for PM2 (needs root).
    try:
        rs = connect(CFG["root_user"], CFG["root_password"])
        run(rs, f"env PATH=$PATH:$(ls -d /home/{SITE_USER}/.nvm/versions/node/*/bin | tail -1) "
                f"pm2 startup systemd -u {SITE_USER} --hp /home/{SITE_USER} 2>&1 | tail -3")
        rs.close()
    except Exception as e:
        p(f"[WARN] pm2 startup (root) failed: {e}")


if __name__ == "__main__":
    main()
