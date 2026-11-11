# Hyperframes Composition Brief: OmGold ERP — Video 03/09 · Stock

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 3 banana: "Stock" (Add Stock · Tally · Transfer · Hallmark · Melting).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/03-stock/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 112.7 s (1:53) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): Stock, Stock › Gold Stock, Stock › Add Stock, Stock › Add Stock, Stock › Stock Tally, Stock › Stock Transfer, Stock › Hallmarking, Stock › Melting, Stock › Insights
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Stock"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Stock dukaan ki jaan hai. Ek piece ko add karne se lekar tally, transfer, hallmark aur melting tak — har screen par "kahan click, kya bharna" dikhaya gaya hai, aur wazan → purity → daam ka hisaab screen ke numbers se.
- Hook: title card "03 · Stock" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: Billing" + progress strip
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
Use the storyboard in `brag-output/03-stock/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 5.1 s — Add Stock · Tally · Transfer · Hallmark · Melting
2. Screen: Stock — 15.8 s — Har category ka card — wazan + valuation / Card par click → list · Sold Out Stock
3. Screen: Stock › Gold Stock — 5.0 s — Har piece: code · wazan · purity · value
4. Screen: Stock › Add Stock — 13.5 s — Stock → Add Stock → category chuniye / Item Name · Metal · Counter · Barcode · HUID
5. Screen: Stock › Add Stock — 26.6 s — Net Wt = Gross − Less / Fine Wt = Net × Purity % / Rate + Making + charges → FINAL VALUATION / Save Stock → available · hisaab mein capital / Supplier ka maal → Billing → Purchase
6. Screen: Stock › Stock Tally — 12.0 s — Stock Tally → har piece scan kijiye / Expected · Counted · Missing · Extra
7. Screen: Stock › Stock Transfer — 7.5 s — Counter → Counter / Firm (manager approve)
8. Screen: Stock › Hallmarking — 8.8 s — Send for Hallmarking → Receive with HUID
9. Screen: Stock › Melting — 5.8 s — Assign to Melt → Complete → naya bar
10. Screen: Stock › Insights — 6.1 s — Fast movers · Dead stock · Re-order
11. Outro — 6.4 s — agla video: Billing

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 1 clip (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (108.8 s)
- Music: `happy-beats-business-moves-vol-9-by-ende-dot-app.mp3` ("Happy Beats / Business Moves Vol. 9", Sascha Ende, ende.app, CC BY 4.0) → `assets/audio/music.mp3`
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

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 22/22 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
