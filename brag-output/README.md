# OmGold ERP — poori series (9 videos, Hinglish)

OmGold ERP ko shuru se aakhir tak samjhane wali 9 videos: asli screens, Hindi awaaz, Roman Hinglish captions. Kul 17:41 (minute:second), 79.0 MB.

## Videos

| # | Video | Lambai | Size | Isme kya hai |
|---|---|---|---|---|
| 1 | [Software ki Pehchaan](01-software-ki-pehchaan/brag.mp4) | 2:01 | 7.9 MB | Login, Menu, Home screen |
| 2 | [Pehli Baar ka Setup](02-pehli-baar-ka-setup/brag.mp4) | 1:49 | 8.3 MB | Firm, GST, Daily Rates, Staff, Customers |
| 3 | [Stock](03-stock/brag.mp4) | 1:53 | 11.1 MB | Add Stock, Tally, Transfer, Hallmark, Melting |
| 4 | [Billing](04-billing/brag.mp4) | 2:53 | 14.1 MB | Sale, Old gold, Purchase, URD, Quotation, Order, Repair |
| 5 | [Gold Loan (Girvi)](05-gold-loan-girvi/brag.mp4) | 1:41 | 8.5 MB | Calculator, New Loan, Byaj, Top-up, Release, Auction |
| 6 | [Udhaar, Schemes, Kharche](06-udhaar-schemes-kharche/brag.mp4) | 1:27 | 6.2 MB | Udhaar, Gold kitty, Expenses, Follow-ups, SMS |
| 7 | [The Books](07-the-books/brag.mp4) | 1:39 | 8.6 MB | Day Book, Ledger, Trial Balance, P&L, Balance Sheet, GST |
| 8 | [Print, Setup, Routine](08-print-setup-routine/brag.mp4) | 1:23 | 6.8 MB | Print Center, Settings, System Logs, Daily checklist |
| 9 | [Andar se kaise bana hai](09-andar-se-kaise-bana-hai/brag.mp4) | 2:55 | 7.6 MB | Tech stack, Firm isolation, Roles, Tests, 40 data models |

- **Video 1–8** dukaan-maalik aur staff ke liye hain — isi order mein dekhiye.
- **Video 9** developer ya naye team member ke liye hai.

## Har folder mein kya hai

| File | Kaam |
|---|---|
| `brag.mp4` | Video — 1920×1080, 30 fps, H.264 + AAC. Pehla frame hi poster hai, taaki WhatsApp, YouTube ya Slack par share karne par thumbnail title card ka aaye. |
| `brag.jpg` | Poster / thumbnail. |
| `share-copy.txt` | Post ke saath likhne layak caption. |
| `brag.hi.srt` | Hindi subtitles (narration ke shabd) — YouTube par video ke saath upload kar sakte hain. |
| `brag-plan.md` | Kahani aur storyboard: har scene ka narration aur caption. |
| `composition-brief.md` | Hyperframes ke liye brief, aur check ka nateeja. |

## Kaise bani

- [brag](https://github.com/latent-spaces/brag) ka workflow (plan → brief → Hyperframes composition → check → render → poster → share copy), har video ke liye.
- **Screens asli app ki hain.** App ko sandbox mein chala kar capture ki gayi hain. Data kalpanik hai (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…) — kisi asli grahak ya dukaan ka nahi.
- **Awaaz** AI ki hai (Hindi). Screen ke captions Roman Hinglish mein hain. Narration aur subtitles ka samay awaaz ke pause naap kar baithaya gaya hai.
- Har video `hyperframes check` se guzri: 0 errors, 0 warnings.

## Ye jaan lijiye

- **Lambai:** brag 15–25 second ki video banata hai. Ye series jaan-boojh kar lambi hai, kyonki maqsad poora software samjhana tha. Baaki sab brag ke hisaab se hai.
- **Awaaz:** AI ki hai. Kisi shabd ka uchcharan galat lage to us video ko dobara render karna hoga.
- **`composition/` yahan nahi hai.** Hyperframes ka source (9 folders, 43.9 MB) size ki wajah se repo mein nahi rakha gaya.
- **Adhure features:** Online Store, SMS gateway, weighing scale ka test aur "Forgot password?" abhi kaam nahi karte. Video 8 ke aakhir mein ye bataya gaya hai.

## Chhoti kamiyan

Inhe theek karne ke liye us video ko dobara render karna hoga.

- **Video 4, 2:11–2:17** ("Convert to Invoice"): zoom mein page ka heading baayein se kata dikhta hai.
- **Video 2, 0:27–0:39** (firm ka State): dialog ke daayein taraf background ki ek patti dikhti hai.
- **Video 3, 1:01–1:06 aur 1:18–1:25; Video 6, 1:02–1:06:** highlight ka box bahut chhota hai.

## Credits

- Music: Sascha Ende, ende.app (CC BY 4.0) — "Happy Beats / Business Moves" Vol. 1, 9, 11, 12. Ye tracks brag ke saath aate hain. Har video ke aakhri card par ye credit likha hai; video kaat kar share karein to credit saath rakhiye.
- Workflow: [brag](https://github.com/latent-spaces/brag) (MIT). Render: [Hyperframes](https://github.com/heygen-com/hyperframes).
