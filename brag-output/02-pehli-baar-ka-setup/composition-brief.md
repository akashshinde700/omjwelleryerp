# Hyperframes Composition Brief: OmGold ERP — Video 02/09 · Pehli Baar ka Setup

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 2 banana: "Pehli Baar ka Setup" (Firm · GST · Daily Rates · Staff · Customers).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/02-pehli-baar-ka-setup/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 108.5 s (1:49) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): Setup › Firms, Setup › Firms › Firm setup, Setup › Settings › Daily Rates, Setup › Settings › People, Customers, Customers › Customer account
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Pehli Baar ka Setup"
  - "Is order mein setup kijiye"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Software tabhi sahi chalta hai jab pehle din ka setup ek tay order mein ho: firm + GST → aaj ka rate → staff → customers. Har step asli screen par, usi order mein jisme dukaan-maalik ko karna hai.
- Hook: title card "02 · Pehli Baar ka Setup" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: Stock" + progress strip
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - App ki screen ko dobara design karna — screen jaisi hai waisi dikhe
  - Asli password, URL, IP ya kisi asli vyakti ka naam screen par

## Visual Identity
- LOOK: garam gehra brown (#1d130b) ground, amber (#fbbf24) accent, cream (#f5f1ea) text, Geist; app ki screen ek browser frame mein, amber box + spotlight + cursor se ek hi cheez par dhyaan
- Background: #1d130b
- Text: #f5f1ea
- Accent: #fbbf24 (gehra: #b84d00)
- Display font: Geist (local woff2, app ka apna font)
- Body font: Geist
- Visual references from the project: dark brown sidebar, amber active menu item, orange primary buttons, gem logo tile

## Storyboard
Use the storyboard in `brag-output/02-pehli-baar-ka-setup/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 8.0 s — Firm · GST · Daily Rates · Staff · Customers
2. Is order mein setup kijiye — 6.3 s — Firm → Rate → Customer → Stock → Bill
3. Screen: Setup › Firms — 7.3 s — Setup → Firms → "Firm details / Edit"
4. Screen: Setup › Firms › Firm setup — 24.8 s — Firm Name · GSTIN · PAN · Address / State sahi = sahi GST (IGST ya CGST+SGST) / CGST 1.5% + SGST 1.5% = 3%
5. Screen: Setup › Settings › Daily Rates — 20.7 s — Setup → Settings → Daily Rates / 24K likhiye → 22K, 18K auto → Save all new rates / Roz subah sabse pehle rate bhariye
6. Screen: Setup › Settings › People — 11.3 s — People → Add Staff (Manager / Staff) / Delete / rate / auction — sirf Owner & Manager
7. Screen: Customers — 12.1 s — Customers · Suppliers · Karigar · Money Lenders / Add Customer → First Name + Mobile
8. Screen: Customers › Customer account — 11.0 s — Naam par click → Outstanding · Gold · Loyalty / Yahin se New Sale · New Loan · Udhaar
9. Outro — 6.9 s — agla video: Stock

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 1 clip (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (104.6 s)
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` ("Happy Beats / Business Moves Vol. 12", Sascha Ende, ende.app, CC BY 4.0) → `assets/audio/music.mp3`
- Music treatment: volume 0.34, narration ke neeche ×0.4 (volume automation lane), fade-in / fade-out
- Music cue guidance: unavailable by choice — narration-led timing; beat locks nahi
- Audio-reactive treatment: none
- Audio-coupled moments:
  - har simulated click — click SFX
  - card / chip reveal — card-slide SFX, bole gaye shabd par
  - scene change — halka rollover
- SFX selection guidance: `ui/click2.ogg`, `casino/card-slide-1.ogg`, `ui/rollover2.ogg` (brag bundled set; kam high-frequency risk wale)
- SFX analysis guidance: brag `assets/sfx/sfx-analysis.md`
- Audio files: sab `composition/assets/audio/` mein local

## Hyperframes Instructions
Composition contract (`hyperframes` skill): `index.html` root composition + har scene ek sub-composition (`compositions/sNN.html`, `data-composition-src`), har ek ki apni paused GSAP timeline `window.__timelines` par; tweens seek-safe (`fromTo`); audio `<audio class="clip">` tracks par.

Requirements:
- Asli app screen dikhe (ya, episode 9 mein, schema se liye gaye asli model naam).
- Composition ka apna text (title, heading, caption, card) ≥ 28 px rahe; app screenshot ke andar ka chhota text camera zoom + highlight se padhne layak banaya jaye.
- Narration, music aur SFX teeno layer rahein; music awaaz ke neeche.
- Sab assets local (fonts, GSAP, audio, images) — koi CDN nahi.
- Render se pehle `npx hyperframes check` — zero errors.

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 31/31 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
