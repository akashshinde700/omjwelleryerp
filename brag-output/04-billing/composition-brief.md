# Hyperframes Composition Brief: OmGold ERP — Video 04/09 · Billing

## Objective
OmGold ERP ki 9-video Hinglish explainer series ka episode 4 banana: "Billing" (Sale · Old gold · Purchase · URD · Quotation · Order · Repair).

## Output
- Composition directory: `composition/` — Hyperframes project (root `index.html` + `compositions/sNN.html` + `assets/`). Size ki wajah se is folder mein shamil nahi; dekhiye `../README.md`.
- Rendered video: `brag-output/04-billing/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 173.0 s (2:53) — explainer episode; brag ka 15–25 s gate is series par lagu nahi (dekhiye brag-plan.md)

## Source Material
- Project root: repository root (OmGold ERP v0.2.1)
- Primary files read: `USER_GUIDE.md`, `CLAUDE.md`, `prisma/schema.prisma`, `src/store/app.ts`, `src/components/app/nav-config.ts`, `src/components/app/modules/*.tsx`, `src/app/api/**/route.ts`
- Product name: OmGold ERP
- Tagline / strongest claim: Ek software, poori dukaan
- Key UI or visual moment to recreate: app ki asli screens (recreate nahi — app ko local chala kar capture ki gayi): Billing › Sell & Purchase, Billing › New Invoice, Billing › New Invoice, Billing › New Invoice, Billing › New Invoice › Old Metal, Billing › Invoice, Billing › New Purchase Bill, Billing › New URD Voucher, Billing › Quotations, Billing › Orders, Billing › Repairs
- Screens ka data: kalpanik demo data (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…). Kisi asli grahak ya dukaan ka data nahi.
- Copy that must appear verbatim:
  - "Billing"
  - "CREATE INVOICE dabate hi…"
  - har beat ka Roman-Hinglish caption (brag-plan.md ke storyboard mein)

## Creative Direction
- Tone preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi highlight, chhote captions; narration aage, screen peeche
- Angle: Sabse zyada istemal hone wala hissa. Ek bill ko shuru se CREATE INVOICE tak follow karte hain (barcode → check → GST → payment), phir baaki kagaz: purchase, URD, quotation, order, repair.
- Hook: title card "04 · Billing" + narrator ki pehli line
- Outro / punchline: "AGLA VIDEO: Gold Loan (Girvi)" + progress strip
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
Use the storyboard in `brag-output/04-billing/brag-plan.md` as the creative contract.

Scene summary:
1. Title card — 3.7 s — Sale · Old gold · Purchase · URD · Quotation · Order · Repair
2. Screen: Billing › Sell & Purchase — 8.0 s — Billing → "New Invoice"
3. Screen: Billing › New Invoice — 12.4 s — Sale · Purchase · URD Purchase / Customer chuniye → rate apne aap
4. Screen: Billing › New Invoice — 12.0 s — Barcode scan / code likhiye → GO / Check kijiye → "ADD TO BILL"
5. Screen: Billing › New Invoice — 35.1 s — GST auto: CGST 1.5% + SGST 1.5% / Cash · Card · UPI · Cheque — mila-jula bhi / Cash khaali = baaki poora cash (auto) / Kam pada = grahak ke khate mein udhaar / Discount · Loyalty · bade cash par PAN
6. Screen: Billing › New Invoice › Old Metal — 11.7 s — Old Metal Exchange (Bhav Cut) / Purane sone par GST nahi — payment ki tarah
7. CREATE INVOICE dabate hi… — 10.3 s — Ek button — teen kaam apne aap
8. Screen: Billing › Invoice — 16.6 s — Eye icon → Print ya WhatsApp / Edit nahi — Return / Credit Note ya Delete
9. Screen: Billing › New Purchase Bill — 7.8 s — Purchase → stock + input GST
10. Screen: Billing › New URD Voucher — 6.2 s — URD Purchase → Seller ka PAN / Aadhaar lijiye
11. Screen: Billing › Quotations — 13.1 s — Quotation = sirf daam ka kagaz / "Convert to Invoice" → bill taiyaar
12. Screen: Billing › Orders — 12.3 s — New Order → Delivery date + Advance / Advance bill mein tick karke adjust
13. Screen: Billing › Repairs — 18.2 s — New Repair Job → Karigar / Ready → "Bill this repair" (18% GST)
14. Outro — 5.8 s — agla video: Gold Loan (Girvi)

## Audio
- Audio role: warm bed under narration
- Audio arc: music khulta hai → narrator ke saath neeche → aakhri 3 s mein wapas upar → fade out
- Voice-over: 2 clips (Hindi, AI voice) — `assets/audio/voiceover-1.mp3` @ 0.9 s (91.6 s), `assets/audio/voiceover-2.mp3` @ 93.2 s (76.8 s)
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

Result: `npx hyperframes check` → OK · errors 0 · warnings 0 · contrast 27/27 text checks passed.
Render: `npx hyperframes render --quality delivery`, phir poster (title card ka settled frame) ko frame 0 par bake kiya gaya (H.264 CRF 23, audio jaisa tha waisa).
