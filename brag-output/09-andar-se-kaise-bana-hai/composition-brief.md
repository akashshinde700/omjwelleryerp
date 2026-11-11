# Hyperframes Composition Brief: OmGold ERP — Video 09/09 · Andar se kaise bana hai

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 9 banana: "Andar se kaise bana hai" (Tech stack · Firm isolation · Roles · Tests · 40 data models).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/09-andar-se-kaise-bana-hai/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 175.1 s (2:55) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: koi app screen nahi — stack, numbers aur 40 data models ke infographic cards (naam seedhe `prisma/schema.prisma` se)
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Andar se kaise bana hai"
  - "Tech stack"
  - "Project ek nazar mein"
  - "Har request par 3 jaanch"
  - "Code ke saath tests bhi"
  - "1–2 / 7 · Login, Firm & People — 4 models"
  - "3 / 7 · Stock — 9 models"
  - "4 / 7 · Billing — 8 models"
  - "5 / 7 · Lending — 8 models"
  - "6 / 7 · Books — 6 models"
  - "7 / 7 · Config & Log — 5 models"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Technical aadmi (developer / naya team member) ke liye: stack, project ke numbers, har request ki 3 jaanch, tests, aur saare 40 data models — group-wise, har model ka naam aur kaam.
- Hook: title card "09 · Andar se kaise bana hai" + narrator ki pehli line
- Outro / punchline: "SERIES POORI HUI — Dhanyavaad!"
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
Use the storyboard in `brag-output/09-andar-se-kaise-bana-hai/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 4.9 s — Tech stack · Firm isolation · Roles · Tests · 40 data models
2. Tech stack — 8.6 s — Next.js + React · Prisma + MySQL
3. Project ek nazar mein — 20.0 s — 13 menu items / 35 screens (tabs) / 65 API route files / 40 data models — 7 groups
4. Har request par 3 jaanch — 15.5 s — Har record par firmId · har request par jaanch / Ek dukaan ka data doosri ko nahi dikhta
5. Code ke saath tests bhi — 9.7 s — 1,402 unit tests — GST, byaj, hisaab
6. 1–2 / 7 · Login, Firm & People — 4 models — 28.1 s — User · Firm · UserFirm — kaun, kahan, kis role se / Customer — grahak, supplier, karigar, lender
7. 3 / 7 · Stock — 9 models — 18.0 s — StockItem + stones · hallmark · melt · transfer · tally
8. 4 / 7 · Billing — 8 models — 17.4 s — Invoice + lines · Quotation · Order · Repair · Loyalty
9. 5 / 7 · Lending — 8 models — 13.5 s — Loan · Udhaar · Scheme — har payment / kisht ke saath
10. 6 / 7 · Books — 6 models — 14.7 s — Account + LedgerEntry = double entry · Bank · Expense
11. 7 / 7 · Config & Log — 5 models — 14.9 s — GoldRate · Setting · Task · SmsLog · SystemLog
12. Outro — 9.8 s — series poori

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 2 clips (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (57.3 s), `assets/audio/voiceover-2.mp3` @ 58.9 s (113.2 s)
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` ("Happy Beats / Business Moves Vol. 1", Sascha Ende, ende.app, CC BY 4.0) → `assets/audio/music.mp3`
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

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 55/55 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
