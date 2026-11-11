# Full video kaise bani

`../brag.mp4` isi folder ki scripts se bani hai: 9 alag videos (`brag-output/0N-*/brag.mp4`) ko joda gaya, aur 5 jagah rendered video par hi framing theek ki gayi. Hyperframes ka source ab nahi hai, isliye ye scenes dobara render nahi hue.

## Chalana

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install numpy opencv-python-headless pillow imageio-ffmpeg
export FFMPEG="$(python -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')"   # ya koi bhi ffmpeg jisme libx264 + aac ho
export WORK="$PWD/work" && mkdir -p "$WORK/fonts"
npm pack geist && tar xzf geist-*.tgz && cp package/dist/fonts/geist-sans/Geist-{Bold,SemiBold,Medium}.ttf "$WORK/fonts/"   # poster ka font

python merge.py --test   # 15 second ka test: sirf joins
python merge.py          # poori video -> $WORK/brag.mp4, poster -> $WORK/brag.jpg   (2 CPU par ~15 minute)
python mksrt.py          # subtitles -> $WORK/brag.hi.srt
```

## Files

| File | Kaam |
|---|---|
| `core.py` | Paths, frame padhna (frame-accurate, bit-exact) aur app-window ki jagah (1920×1080 frame mein x 192, y 88, 1536×864). |
| `patches.py` | Paanch fixes. Har fix ke upar likha hai ki kya galat tha aur kya kiya. |
| `poster.py` | Series ka poster: episode 1 ke title card par naya text. |
| `merge.py` | Jod: har hisse ka frame 0 (uska apna poster) hatata hai, hisson ke beech 0.3 s ka dissolve, audio sample-exact, chapters, H.264 CRF 22. |
| `mksrt.py` | 9 subtitle files ko ek mein jodta hai. |

## Fixes kaise kaam karte hain

- **Zoom / re-framing (4 jagah):** app-window ke andar ki picture ka ek hissa bada karke dikhaya jata hai (`CropZoom`). Scene ke aakhir ka cross-fade pehle alag kiya jata hai (`Unblend`), taaki agla scene apni asli framing mein aaye.
- **Video 4 ("Convert to Invoice"):** camera 4% pehle rukta hai (`Ep04Convert`). Static screen lit frames se li gayi hai aur naapa hua spotlight overlay us par lagaya gaya hai; cursor aur highlight wali row usi pal ke asli frame se aati hai.
- Frames YUV mein hi rehte hain (BT.709, limited range) — rang nahi badalte. Jo frames nahi chhue gaye wo decoder se encoder tak jaise ke taise jaate hain.
