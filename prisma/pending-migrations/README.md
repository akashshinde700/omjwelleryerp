# Migrations that are written but MUST NOT be applied yet

A migration in this folder is **not** in `prisma/migrations/`, so `prisma migrate deploy`
will not apply it and `prisma generate` will not put its columns in the client.

## Why this folder exists — a defect, not a style

On 2026-10-06 the lots/sets schema was committed to `schema.prisma` while its migration was
deliberately left unapplied to the live `omerp` database. That single step broke the running shop:

    The column `omerp.StockItem.lotShape` does not exist in the current database.

`prisma generate` builds the client from `schema.prisma`, and a Prisma `findMany` SELECTs every
scalar field in the model. So the moment the schema carried a column the database did not have,
**every query that reads a stock row failed** — the whole Stock screen, every card, Add Stock,
and billing's stock lookup. The summary cards still showed figures because they use `groupBy`
with explicit `_sum` fields and `$queryRaw`, which never name the new columns. That is why the
screen showed "8 items, Rs 9,11,250" above a list that said "Nothing in this category".

**THE RULE THIS BUYS: `schema.prisma` must always describe the database the app is pointed at.**
A column may enter `schema.prisma` only in the same change that applies its migration. Writing
the migration early is fine — park it here.

## Applying one

1. Resolve anything listed in `prisma/MIGRATION-RESYNC.md` first, or `migrate deploy` stops on it.
2. `mysqldump` the database.
3. Move the folder into `prisma/migrations/`, put its columns into `schema.prisma`, and apply —
   in ONE change, together with the code that uses them.
4. `npx prisma generate`, then restart the dev server. The dev server holds the client's DLL open
   on Windows, so generate fails with EPERM while it runs.

## 20261006120000_stock_lots_sets

Wholesale lots, mixed packets, per-piece weights and pairs/sets. The model is described in
worklog Task ID 101. Do not apply it until `GET /api/stock`, `/api/stock/summary` and
`computeOmunimStock` understand lots: until then a lot's received weight counts as stock on hand
AND its pieces count again, so the shop's totals read double.
