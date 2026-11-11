# Brag Plan: OmGold ERP — Video 09/09 · Andar se kaise bana hai

> Series "OmGold ERP — poori series" ka ek episode (9 videos, Hinglish). Poori series ka index: `../README.md`.

## What is this app?
OmGold ERP jewellery dukaan ka poora software hai — GST billing, tag-wala stock, gold loan (girvi), udhaar, schemes aur double-entry bahi-khata ek hi jagah, web + desktop + mobile par.

## The angle
Technical aadmi (developer / naya team member) ke liye: stack, project ke numbers, har request ki 3 jaanch, tests, aur saare 40 data models — group-wise, har model ka naam aur kaam.

## Hook (first 2-3 seconds)
Title card: peeche bada "09", saamne "Andar se kaise bana hai". Narrator pehli hi line mein bata deta hai ki is video mein kya milega:
"अब देखते हैं ओम गोल्ड ई आर पी अंदर से कैसे बना है।"

## Key moments (the middle)
- **Tech stack** — Next.js 16 + React 19, Prisma 6 + MySQL, NextAuth, Electron · Expo
- **Project ek nazar mein** — 13, 35, 65, 40
- **Har request par 3 jaanch** — Request → Login? → Is firm ka member? → Role (Owner / Manager / Staff)? → Data
- **Code ke saath tests bhi** — 1,402, 80, 35
- **1–2 / 7 · Login, Firm & People — 4 models** — User, Firm, UserFirm, Customer
- **3 / 7 · Stock — 9 models** — StockItem, Stone, HallmarkBatch, HallmarkBatchItem, MeltBatch, MeltBatchItem, StockTransfer, StockTally, StockTallyScan
- **4 / 7 · Billing — 8 models** — Invoice, InvoiceItem, InvoiceSequence, Quotation, QuotationItem, Order, Repair, LoyaltyPoint
- **5 / 7 · Lending — 8 models** — Loan, LoanItem, LoanTransaction, Udhaar, UdhaarPayment, Scheme, SchemeEntry, SchemeInstallment
- **6 / 7 · Books — 6 models** — Account, LedgerEntry, Expense, BankAccount, BankTransaction, BankStatementLine
- **7 / 7 · Config & Log — 5 models** — GoldRate, Setting, Task, SmsLog, SystemLog

## Outro / punchline
"SERIES POORI HUI — Dhanyavaad!" — nau ke nau chips par tick.

## User flow worth showing
none — is episode mein app ka flow nahi, sirf technical infographics hain (stack, numbers, models).

## Tone
- Preset: polished
- Creative direction: counter par baithkar sikhane wala — shaant, seedha, bina jargon
- Interpretation: lambi holds, ek waqt mein ek hi cheez highlight, caption chhota. Narration aage chalti hai, screen uske peeche; koi joke ya hype nahi.

## Format: landscape — 1920x1080
## Duration: 175.1 s (2:55)

brag ka default 15–25 s hai. Ye jaan-boojh kar usse lamba hai: maang "shuru se aakhir tak samjhane wali" series ki thi, isliye lambai narration tay karti hai, 15–25 s ka gate is series par lagu nahi kiya gaya. Baaki sab gates (plan, brief, `hyperframes check` zero errors, poster frame 0, share copy) poore kiye gaye hain.

## Visual identity (from the project)
- Background: #1d130b (app ke dark sidebar wala brown)
- Accent: #fbbf24 (amber); gehra #b84d00 (app ka primary button)
- Text: #f5f1ea
- Display font: Geist (app ka apna font)
- Body font: Geist
- Strongest visual element: app ki asli screens — amber highlight box, spotlight aur cursor ke saath

## Share copy (draft)
OmGold ERP andar se: Next.js + Prisma + MySQL, 35 screens, 65 API route files, 40 data models, 1,402 unit tests. Video 9/9.

## Audio direction
- Role: warm bed (narration ke neeche)
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` — "Happy Beats / Business Moves Vol. 1", Sascha Ende (ende.app), CC BY 4.0
- Music treatment: 0 s se shuru, volume 0.34; narrator ke bolte waqt ×0.4 (duck); aakhri 3 s mein wapas upar, phir fade out; track video se chhota hai isliye crossfade ke saath dobara chalta hai
- Music cue guidance: beat-sync nahi kiya — timing narration tay karti hai (voice-over ke har phrase ka samay naap kar reveals usi par rakhe gaye hain)
- Audio-reactive treatment: none
- SFX posture: sparse — scene badalne par halka rollover, har simulated click par click, card aane par card-slide
- Audio-coupled moments: cursor click ↔ click SFX; card / chip reveal ↔ bola gaya shabd
- Restraint rule: music kabhi awaaz se nahi ladta; highlight box par koi SFX nahi

## Storyboard

### Scene 1 — Title card — 0.0–4.9 s (4.9 s)
Peeche bada "09", saamne title "Andar se kaise bana hai", neeche chips: Tech stack · Firm isolation · Roles · Tests · 40 data models.
- 0.9 s — narration: "अब देखते हैं ओम गोल्ड ई आर पी अंदर से कैसे बना है।"
Sequential/interaction: yes — chips ek-ek karke aate hain
Audio intent: music poori awaaz par khulta hai; 0.9 s par narrator aate hi neeche chala jaata hai
Audio-coupled idea: chip reveal ↔ card-slide SFX
Transition mood: soft (0.4 s crossfade) → Scene 2

### Scene 2 — Tech stack — 4.9–13.4 s (8.6 s)
Heading "Tech stack" + 4 cards: Next.js 16 + React 19 (Web app (TypeScript)); Prisma 6 + MySQL (Database); NextAuth (Login + session); Electron · Expo (Desktop + Mobile).
- 5.1 s — narration: "ये नेक्स्ट जे एस और रिएक्ट पर बना वेब ऐप है। डेटा माई एस क्यू एल डेटाबेस में रहता है, प्रिज़्मा के ज़रिए।"
  caption: "Next.js + React · Prisma + MySQL"
Sequential/interaction: yes — cards / numbers ek-ek karke, narration ke saath
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 3

### Scene 3 — Project ek nazar mein — 13.4–33.5 s (20.0 s)
Heading "Project ek nazar mein" + 4 bade number: 13 Menu items · 35 Screens · 65 API route files · 40 Data models.
- 13.6 s — narration: "पूरा ऐप एक ही पेज है। मेन्यू में तेरह दरवाज़े हैं।"
  caption: "13 menu items"
- 18.2 s — narration: "इनके पीछे पैंतीस स्क्रीन टैब बनकर रहती हैं।"
  caption: "35 screens (tabs)"
- 21.9 s — narration: "हर काम सर्वर की ए पी आई से होता है — पैंसठ रूट फ़ाइलें।"
  caption: "65 API route files"
- 26.1 s — narration: "और डेटाबेस में चालीस मॉडल यानी टेबल हैं। इन्हें आगे एक-एक ग्रुप करके देखेंगे।"
  caption: "40 data models — 7 groups"
Sequential/interaction: yes — cards / numbers ek-ek karke, narration ke saath
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 4

### Scene 4 — Har request par 3 jaanch — 33.5–49.0 s (15.5 s)
Heading "Har request par 3 jaanch" + step chips: Request → Login? → Is firm ka member? → Role (Owner / Manager / Staff)? → Data.
- 33.7 s — narration: "सबसे ज़रूरी नियम — हर रिकॉर्ड पर फ़र्म आई डी होती है, और हर रिक्वेस्ट पर सर्वर जाँचता है कि यूज़र उस फ़र्म का है या नहीं।"
  caption: "Har record par firmId · har request par jaanch"
- 42.0 s — narration: "इसलिए एक दुकान का डेटा दूसरी को नहीं दिखता। रोल तीन हैं — ओनर, मैनेजर और स्टाफ़।"
  caption: "Ek dukaan ka data doosri ko nahi dikhta"
Sequential/interaction: yes — step chips ek-ek karke, aakhri chip amber
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 5

### Scene 5 — Code ke saath tests bhi — 49.0–58.7 s (9.7 s)
Heading "Code ke saath tests bhi" + 3 bade number: 1,402 Unit tests · 80 API test files · 35 Browser (E2E) test files.
- 49.2 s — narration: "और कोड के साथ टेस्ट भी हैं — तेरह सौ से ज़्यादा यूनिट टेस्ट, जो जी एस टी, ब्याज और हिसाब की गणित जाँचते हैं।"
  caption: "1,402 unit tests — GST, byaj, hisaab"
Sequential/interaction: yes — cards / numbers ek-ek karke, narration ke saath
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 6

### Scene 6 — 1–2 / 7 · Login, Firm & People — 4 models — 58.7–86.8 s (28.1 s)
Heading "1–2 / 7 · Login, Firm & People — 4 models" + 4 model cards (naam + kaam): User (Login ID, password, role); Firm (Dukaan: GSTIN, state, tax); UserFirm (Kaun · kis firm mein · kis role se); Customer (Grahak · supplier · karigar · lender).
- 58.9 s — narration: "अब चालीस मॉडल, सात ग्रुप में। पहला ग्रुप — लॉगिन और फ़र्म। यूज़र में लॉगिन आई डी और रोल रहता है। फ़र्म यानी आपकी दुकान — जी एस टी आई एन और स्टेट के साथ। और यूज़र-फ़र्म बताता है कि कौन, किस फ़र्म में, किस रोल से काम करता है।"
  caption: "User · Firm · UserFirm — kaun, kahan, kis role se"
- 78.7 s — narration: "दूसरा ग्रुप एक ही मॉडल है — कस्टमर। ग्राहक, सप्लायर, कारीगर और मनी लेंडर, सब इसी में रहते हैं।"
  caption: "Customer — grahak, supplier, karigar, lender"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 7

### Scene 7 — 3 / 7 · Stock — 9 models — 86.8–104.8 s (18.0 s)
Heading "3 / 7 · Stock — 9 models" + 9 model cards (naam + kaam): StockItem (Har piece: wazan, purity, daam); Stone (Item ke nag / heere); HallmarkBatch (Hallmark centre bheja batch); HallmarkBatchItem (Batch ka har piece + HUID); MeltBatch (Galai ka lot); MeltBatchItem (Lot mein gaya har piece); StockTransfer (Counter / firm badalna); StockTally (Ginti ka session); StockTallyScan (Session ka har scan).
- 87.0 s — narration: "तीसरा — स्टॉक, नौ मॉडल। स्टॉक आइटम में हर पीस का वज़न, प्योरिटी और दाम। स्टोन में उसके नग। हॉलमार्क बैच और मेल्ट बैच — बाहर भेजे गए माल का हिसाब। फिर स्टॉक ट्रांसफ़र, और स्टॉक टैली — हर स्कैन के साथ।"
  caption: "StockItem + stones · hallmark · melt · transfer · tally"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 8

### Scene 8 — 4 / 7 · Billing — 8 models — 104.8–122.1 s (17.4 s)
Heading "4 / 7 · Billing — 8 models" + 8 model cards (naam + kaam): Invoice (Sale · Purchase · URD · Return); InvoiceItem (Bill ki har line); InvoiceSequence (Bill number ka counter); Quotation (Daam ka kagaz); QuotationItem (Quotation ki line); Order (Naya zevar + advance); Repair (Marammat ka job); LoyaltyPoint (Points: kamaye / kharche).
- 105.0 s — narration: "चौथा — बिलिंग, आठ मॉडल। इनवॉइस और उसकी लाइनें — सेल, परचेज़, यू आर डी और रिटर्न, सब इसी में। इनवॉइस सीक्वेंस बिल नंबर गिनता है। साथ में कोटेशन, ऑर्डर, रिपेयर और लॉयल्टी पॉइंट।"
  caption: "Invoice + lines · Quotation · Order · Repair · Loyalty"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 9

### Scene 9 — 5 / 7 · Lending — 8 models — 122.1–135.6 s (13.5 s)
Heading "5 / 7 · Lending — 8 models" + 8 model cards (naam + kaam): Loan (Girvi loan); LoanItem (Girvi rakha zevar); LoanTransaction (Har payment / top-up); Udhaar (Diya · liya · advance); UdhaarPayment (Udhaar ki wapsi); Scheme (Kitty plan); SchemeEntry (Scheme ka member); SchemeInstallment (Har kisht).
- 122.3 s — narration: "पाँचवाँ — लेन-देन, आठ मॉडल। लोन, उसके गिरवी आइटम, और हर पेमेंट का ट्रांज़ैक्शन। उधार और उसकी वापसी। और स्कीम, उसके मेंबर, और हर किस्त।"
  caption: "Loan · Udhaar · Scheme — har payment / kisht ke saath"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 10

### Scene 10 — 6 / 7 · Books — 6 models — 135.6–150.3 s (14.7 s)
Heading "6 / 7 · Books — 6 models" + 6 model cards (naam + kaam): Account (Khaton ki list); LedgerEntry (Har rupaya: Dr / Cr); Expense (Dukaan ka kharcha); BankAccount (Bank khata); BankTransaction (Bank entry / cheque); BankStatementLine (Statement ki line).
- 135.8 s — narration: "छठा — बही-खाता, छह मॉडल। अकाउंट यानी खातों की लिस्ट। लेजर एंट्री — जहाँ हर रुपया डेबिट और क्रेडिट में दर्ज होता है। साथ में एक्सपेंस, बैंक अकाउंट, बैंक ट्रांज़ैक्शन और स्टेटमेंट लाइन।"
  caption: "Account + LedgerEntry = double entry · Bank · Expense"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: clean (purana text pehle hatta hai, phir naya aata hai) → Scene 11

### Scene 11 — 7 / 7 · Config & Log — 5 models — 150.3–165.2 s (14.9 s)
Heading "7 / 7 · Config & Log — 5 models" + 5 model cards (naam + kaam): GoldRate (Roz ka bhav); Setting (Firm ki settings); Task (Follow-up / reminder); SmsLog (Bheje gaye SMS); SystemLog (Kisne, kab, kya kiya).
- 150.5 s — narration: "और सातवाँ — सेटिंग और लॉग, पाँच मॉडल। गोल्ड रेट में रोज़ का भाव, सेटिंग में फ़र्म की पसंद, टास्क में फॉलो-अप, और एस एम एस लॉग। आख़िर में सिस्टम लॉग — हर काम का रिकॉर्ड।"
  caption: "GoldRate · Setting · Task · SmsLog · SystemLog"
Sequential/interaction: yes — har model card tab aata hai jab narrator uska naam leta hai
Audio intent: music awaaz ke neeche; har card par halka sa slide
Audio-coupled idea: card reveal ↔ bola gaya shabd + card-slide SFX
Transition mood: soft (0.4 s crossfade) → Scene 12

### Scene 12 — Outro — 165.2–175.1 s (9.8 s)
"SERIES POORI HUI — Dhanyavaad!", 9 chips ki poori progress strip, neeche music + demo-data credit.
- 165.4 s — narration: "बस, यही है पूरा ओम गोल्ड ई आर पी। सीरीज़ देखने के लिए धन्यवाद!"
Sequential/interaction: yes — progress chips ek-ek karke aate hain
Audio intent: narration khatm hote hi music wapas upar, 3 s ki tail, phir fade out
Audio-coupled idea: chip reveal ↔ card-slide SFX
Transition mood: — (video yahin khatm)

**Music mood for this video:** upbeat lekin halka (business / explainer)
**Audio summary:** Music khulta hai, narrator ke aate hi neeche baith jaata hai, poore video mein awaaz ke peeche rehta hai aur aakhri 3 second mein wapas ubhar kar fade ho jaata hai; SFX sirf click, card aur scene-change par.
