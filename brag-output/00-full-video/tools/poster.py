"""Series poster for the full video: the episode-1 title card with its own text replaced."""
import os, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from core import read_yuv, planes, FW, FH, WORK
F=os.path.join(os.environ.get('GEIST_DIR', os.path.join(WORK,'fonts')),'')   # Geist-Bold/SemiBold/Medium.ttf, e.g. from `npm pack geist`
CHAPTERS=['Software ki Pehchaan','Pehli Baar ka Setup','Stock','Billing','Gold Loan (Girvi)','Udhaar, Schemes, Kharche','The Books','Print, Setup, Routine','Andar se kaise bana hai']
def title_card():
    """frame 0 of episode 1 (its baked poster) as BGR, BT.709 limited range."""
    y,u,v=planes(read_yuv('ep01',0)[0])
    Y=(y.astype(np.float32)-16)*1.164383; U=cv2.resize(u,(FW,FH),interpolation=cv2.INTER_LINEAR).astype(np.float32)-128; V=cv2.resize(v,(FW,FH),interpolation=cv2.INTER_LINEAR).astype(np.float32)-128
    return np.clip(np.dstack([Y+2.112402*U, Y-0.213249*U-0.532909*V, Y+1.792741*V]),0,255).astype(np.uint8)
def build(total='17:41'):
    im=title_card()
    # 1. wipe the old title, chips, big number, top-right label and the progress fill; rebuild the smooth background there
    mask=np.zeros(im.shape[:2],np.uint8)
    for (x0,y0,x1,y1) in [(150,372,1040,645),(150,692,1040,810),(1040,170,1900,910),(1470,36,1790,134)]: mask[y0:y1,x0:x1]=255
    k=8; small=cv2.resize(im,(im.shape[1]//k,im.shape[0]//k),interpolation=cv2.INTER_AREA)
    # everything that is not plain background (logo, kicker, underline, old text) must not leak into the fill
    notbg=cv2.dilate((cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)>52).astype(np.uint8)*255,np.ones((31,31),np.uint8))
    ms=cv2.resize(cv2.max(mask,notbg),(small.shape[1],small.shape[0]),interpolation=cv2.INTER_AREA); ms=cv2.dilate((ms>0).astype(np.uint8)*255,np.ones((3,3),np.uint8))
    fill=cv2.inpaint(small,ms,6,cv2.INPAINT_TELEA)
    fill=cv2.GaussianBlur(cv2.resize(fill,(im.shape[1],im.shape[0]),interpolation=cv2.INTER_CUBIC),(0,0),6)
    a=cv2.GaussianBlur(mask.astype(np.float32)/255,(0,0),5)[...,None]
    bg=(im*(1-a)+fill*a)
    bg[1030:1080,0:160]=bg[1030:1080,300:460]                      # progress bar back to 0
    img=Image.fromarray(cv2.cvtColor(np.clip(bg,0,255).astype(np.uint8),cv2.COLOR_BGR2RGB)).convert('RGBA')
    d=ImageDraw.Draw(img)
    WHITE=(245,241,234,255); AMBER=(251,191,36,255); MUTE=(214,206,194,255)
    # 2. title, two lines, same size and position as the episode cards
    ft=ImageFont.truetype(F+'Geist-Bold.ttf',128)
    for i,line in enumerate(['Poora Software,','Ek Video Mein']):
        d.text((186,366+i*135),line,font=ft,fill=WHITE)
    # 3. chips: the nine parts, two rows
    fc=ImageFont.truetype(F+'Geist-Medium.ttf',28)
    x,y=192,706
    for n,name in enumerate(CHAPTERS):
        label=f'{n+1}  {name}'; tw=d.textlength(label,font=fc); w=int(tw)+44; h=58
        if x+w>1760: x=192; y+=74
        ov=Image.new('RGBA',img.size,(0,0,0,0)); do=ImageDraw.Draw(ov)
        do.rounded_rectangle((x,y,x+w,y+h),radius=29,fill=(245,241,234,14),outline=(245,241,234,60),width=2)
        img=Image.alpha_composite(img,ov); d=ImageDraw.Draw(img)
        d.text((x+22,y+11),f'{n+1}',font=fc,fill=AMBER); d.text((x+22+d.textlength(f'{n+1}  ',font=fc),y+11),name,font=fc,fill=MUTE)
        x+=w+14
    # 4. top-right label, letter-spaced caps like the "VIDEO 01 / 09" label
    fl=ImageFont.truetype(F+'Geist-SemiBold.ttf',28); txt=f'POORI SERIES  ·  {total}'; tr=3.4
    wtot=sum(d.textlength(ch,font=fl)+tr for ch in txt)-tr; xx=1740-wtot
    for ch in txt: d.text((xx,69),ch,font=fl,fill=AMBER); xx+=d.textlength(ch,font=fl)+tr
    return cv2.cvtColor(np.array(img.convert('RGB')),cv2.COLOR_RGB2BGR)
if __name__=='__main__':
    cv2.imwrite(os.path.join(WORK,'poster.png'), build()); print('ok')
