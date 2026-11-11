# Hyperframes Composition Brief: OmGold ERP — Video 07/09 · The Books

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 7 banana: "The Books" (Day Book · Ledger · Trial Balance · P&L · Balance Sheet · GST).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/07-the-books/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 99.4 s (1:39) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): The Books › Day Book, The Books › Ledger, The Books › Bank Rec, The Books › Trial Balance, The Books › Profit & Loss, The Books › Balance Sheet, The Books › GST, The Books › Reports
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "The Books"
  - "Sab kuch apne aap chadhta hai"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Accounting ka darr nikaalna. Alag se kuch chadhana nahi padta — bill, girvi, udhaar se entries apne aap banti hain. Yahan sirf padhna seekhna hai: Day Book, Ledger, Trial Balance, P&L, Balance Sheet, GST.
- Hook: title card "07 · The Books" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: Print, Setup, Routine" + progress strip
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
Use the storyboard in `brag-output/07-the-books/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 7.5 s — Day Book · Ledger · Trial Balance · P&L · Balance Sheet · GST
2. Sab kuch apne aap chadhta hai — 8.6 s — Double entry: Debit = Credit, apne aap
3. Screen: The Books › Day Book — 6.5 s — Day Book — aaj kitna aaya, kitna gaya / Cash "Closing" = galle ka cash
4. Screen: The Books › Ledger — 6.3 s — Ledger — ek khate ka poora hisaab
5. Screen: The Books › Bank Rec — 5.8 s — Bank Rec — cheque Clear / Bounce
6. Screen: The Books › Trial Balance — 15.2 s — Trial Balance — Dr total = Cr total / "Balanced" = sab theek · laal chetavani = gadbad
7. Screen: The Books › Profit & Loss — 8.6 s — Profit & Loss — Income − Expenses = Net Profit
8. Screen: The Books › Balance Sheet — 8.2 s — Balance Sheet — kya hai, kiska dena hai
9. Screen: The Books › GST — 17.2 s — Output − Input = Net GST Payable / Sales · Purchases · URD register → CA ko
10. Screen: The Books › Reports — 7.8 s — Reports + "Export to Tally"
11. Outro — 7.7 s — agla video: Print, Setup, Routine

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 1 clip (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (95.5 s)
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

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 32/32 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
