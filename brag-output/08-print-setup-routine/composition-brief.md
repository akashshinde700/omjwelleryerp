# Hyperframes Composition Brief: OmGold ERP — Video 08/09 · Print, Setup, Routine

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 8 banana: "Print, Setup, Routine" (Print Center · Settings · System Logs · Daily checklist).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/08-print-setup-routine/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 83.2 s (1:23) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): Print › Documents, Print › Bar-Code Print Panel, Print › Invoice Layout, Setup › Settings, Setup › System Logs
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Print, Setup, Routine"
  - "Roz ka routine"
  - "Mahine ke end mein"
  - "Abhi adhura hai — bharosa na karein"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Print, settings, logs aur roz / mahine ka routine — aur imaandaari se wo 4 cheezein jo software mein abhi adhuri hain, taaki koi un par bharosa na kare.
- Hook: title card "08 · Print, Setup, Routine" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: Andar se kaise bana hai" + progress strip
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
Use the storyboard in `brag-output/08-print-setup-routine/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 7.5 s — Print Center · Settings · System Logs · Daily checklist
2. Screen: Print › Documents — 6.9 s — Print → Documents: girvi note, register, notice
3. Screen: Print › Bar-Code Print Panel — 7.2 s — Bar-Code Print Panel — pehle .prn file upload
4. Screen: Print › Invoice Layout — 8.9 s — Invoice Layout — label par tap: naam badlo / chhupao
5. Screen: Setup › Settings — 8.6 s — Calculation settings — sirf default values
6. Screen: Setup › System Logs — 6.5 s — System Logs — kisne, kab, kya kiya
7. Roz ka routine — 12.2 s — Subah: Login → Firm → Rate / Din bhar: Billing · Girvi · Udhaar · Kharche / Shaam: Day Book se cash milao → Sign out
8. Mahine ke end mein — 8.0 s — Month-end: Tally · Overdue · GST · Trial Balance
9. Abhi adhura hai — bharosa na karein — 9.9 s — Ye 4 cheezein abhi adhuri hain
10. Outro — 7.5 s — agla video: Andar se kaise bana hai

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 1 clip (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (79.3 s)
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

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 39/39 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
