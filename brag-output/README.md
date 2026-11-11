# OmGold ERP — poori series (Hinglish)

OmGold ERP ko shuru se aakhir tak samjhane wali videos: asli screens, Hindi awaaz, Roman Hinglish captions.

## Poora software, ek video mein

**[00-full-video/brag.mp4](00-full-video/brag.mp4)** — 17:41, 79.5 MB. Neeche ki 9 videos ek saath, isi order mein.

| Samay | Hissa |
|---|---|
| 0:00 | 1. Software ki Pehchaan |
| 2:01 | 2. Pehli Baar ka Setup |
| 3:49 | 3. Stock |
| 5:42 | 4. Billing |
| 8:35 | 5. Gold Loan (Girvi) |
| 10:16 | 6. Udhaar, Schemes, Kharche |
| 11:43 | 7. The Books |
| 13:22 | 8. Print, Setup, Routine |
| 14:46 | 9. Andar se kaise bana hai |

Folder mein `brag.mp4` ke saath poster `brag.jpg`, Hindi subtitles `brag.hi.srt`, `share-copy.txt` aur `chapters.txt` (YouTube description mein chipkane ke liye) hain. MP4 ke andar bhi yahi chapters hain. `tools/` mein wo scripts hain jinse ye video bani.

Is video mein 5 jagah framing theek ki gayi hai — neeche "Theek ki gayi kamiyan" dekhiye.

## 9 alag videos

Kul 17:41 (minute:second), 79.0 MB.

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
| `brag-plan.md` | Kahani aur storyboard: har scene ka narration aur caption. (Sirf 9 alag videos mein.) |
| `composition-brief.md` | Hyperframes ke liye brief, aur check ka nateeja. (Sirf 9 alag videos mein.) |

## Kaise bani

- [brag](https://github.com/latent-spaces/brag) ka workflow (plan → brief → Hyperframes composition → check → render → poster → share copy), har video ke liye.
- **Screens asli app ki hain.** App ko sandbox mein chala kar capture ki gayi hain. Data kalpanik hai (firm "Jai Bhavani Jewellers", grahak Ramesh Kumar, Sunita Devi…) — kisi asli grahak ya dukaan ka nahi.
- **Awaaz** AI ki hai (Hindi). Screen ke captions Roman Hinglish mein hain. Narration aur subtitles ka samay awaaz ke pause naap kar baithaya gaya hai.
- Har video `hyperframes check` se guzri: 0 errors, 0 warnings.
- **Full video** 9 videos ko ffmpeg se jod kar bani hai; har hisse ke shuru mein 0.3 second ka dissolve hai. 5 jagah ki framing rendered video par hi badli gayi hai, kyonki un scenes ko dobara render karne ka source ab nahi hai. Poori video ek baar aur encode hui hai (H.264, CRF 22).

## Ye jaan lijiye

- **Lambai:** brag 15–25 second ki video banata hai. Ye series jaan-boojh kar lambi hai, kyonki maqsad poora software samjhana tha. Baaki sab brag ke hisaab se hai.
- **Awaaz:** AI ki hai. Kisi shabd ka uchcharan galat lage to us video ko dobara banana hoga.
- **Hyperframes ka source ab nahi hai.** `composition/` folders size ki wajah se repo mein nahi rakhe gaye the, aur jis workspace mein the wo ab nahi hai. Aage koi scene badalna ho to rendered video par hi kaam hoga, ya us video ko shuru se banana hoga.
- **"Video N / 9" aur "Agla video":** full video mein bhi har hissa apne title card se shuru hota hai aur narration "agle video" hi kehti hai — ye 9 videos ka jod hai, nayi recording nahi.
- **Adhure features:** Online Store, SMS gateway, weighing scale ka test aur "Forgot password?" abhi kaam nahi karte. Video 8 ke aakhir mein ye bataya gaya hai.

## Theek ki gayi kamiyan (sirf full video mein)

| Full video mein | Alag video mein | Kya tha | Kya kiya |
|---|---|---|---|
| 2:28–2:41 | Video 2, 0:27–0:39 | Dialog ke daayein taraf background ki ek patti dikhti thi. | Framing 1.2× tight ki; patti ab frame ke bahar hai. |
| 4:51–4:56 | Video 3, 1:01–1:06 | Sidebar mein "Billing" ka highlight bahut chhota tha. | Camera ab page ke baayein hisse par rukta hai (1.47×). |
| 5:07–5:15 | Video 3, 1:18–1:25 | Status ka highlight chhota tha. | Poora scene ab table par framed hai (1.34×). |
| 7:53–7:59 | Video 4, 2:11–2:17 | Zoom mein page ka heading baayein se kata tha. | Camera 4% pehle rukta hai; heading poora dikhta hai. |
| 11:19–11:23 | Video 6, 1:02–1:06 | "Total" aur "The Books" ke highlight bahut chhote the. | Page ke baayein hisse par zoom (1.49×). |

- **Alag videos 2, 3, 4 aur 6 ki files nahi badli hain** — unme ye kamiyan abhi hain.
- Jahan zoom badhaya gaya hai (1.2× se 1.5×), wahan picture rendered video se badi ki gayi hai, isliye un kuch second mein text thoda naram dikhta hai.

## Credits

- Music: Sascha Ende, ende.app (CC BY 4.0) — "Happy Beats / Business Moves" Vol. 1, 9, 11, 12. Ye tracks brag ke saath aate hain. Har video ke aakhri card par ye credit likha hai; video kaat kar share karein to credit saath rakhiye.
- Workflow: [brag](https://github.com/latent-spaces/brag) (MIT). Render: [Hyperframes](https://github.com/heygen-com/hyperframes).
