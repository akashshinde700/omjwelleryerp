# Hyperframes Composition Brief: OmGold ERP — Video 06/09 · Udhaar, Schemes, Kharche

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 6 banana: "Udhaar, Schemes, Kharche" (Udhaar · Gold kitty · Expenses · Follow-ups · SMS).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/06-udhaar-schemes-kharche/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 86.7 s (1:27) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): Udhaar, Udhaar › Add Entry, Schemes, Schemes › Passbook, Expenses, Follow-ups › Reminders, Follow-ups › SMS
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Udhaar, Schemes, Kharche"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Chhote lekin roz ke kaam: udhaar diya / liya, gold kitty (11+1), kharche, follow-ups. SMS abhi demo mode mein hai — ye baat video mein saaf boli gayi hai.
- Hook: title card "06 · Udhaar, Schemes, Kharche" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: The Books" + progress strip
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
Use the storyboard in `brag-output/06-udhaar-schemes-kharche/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 6.2 s — Udhaar · Gold kitty · Expenses · Follow-ups · SMS
2. Screen: Udhaar — 12.8 s — Diya (Given) — aapko wapas lena hai / Liya (Taken) · Advance
3. Screen: Udhaar › Add Entry — 7.9 s — Add Entry → Amount · Due Date · (byaj / EMI)
4. Screen: Udhaar — 6.9 s — Wapas aaya → jama · poora → Mark settled
5. Screen: Schemes — 13.9 s — Schemes = gold kitty (11 + 1) / "View Subscribers" → Add Subscriber
6. Screen: Schemes › Passbook — 10.7 s — Passbook → har mahine kisht receive / Maturity → "Redeem into sale"
7. Screen: Expenses — 8.0 s — Expenses → rent, salary, bijli… / Apne aap Day Book + P&L mein
8. Screen: Follow-ups › Reminders — 6.0 s — Follow-ups → Add Task
9. Screen: Follow-ups › SMS — 7.7 s — SMS abhi demo mode — WhatsApp use kijiye
10. Outro — 6.6 s — agla video: The Books

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 1 clip (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (82.8 s)
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` ("Happy Beats / Business Moves Vol. 11", Sascha Ende, ende.app, CC BY 4.0) → `assets/audio/music.mp3`
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
