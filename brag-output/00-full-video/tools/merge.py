#!/usr/bin/env python
"""Join the nine episodes into one video, with the post-production fixes applied on the way through.
usage: merge.py [--test]     (--test: first 45 frames of every episode only, video only, to check the joins)"""
import subprocess, sys, time, os, numpy as np, cv2
from core import *
from patches import make_patches, Ep04Convert
import poster
TEST='--test' in sys.argv
ORDER=['ep01','ep02','ep03','ep04','ep05','ep06','ep07','ep08','ep09']
TITLES=['Software ki Pehchaan','Pehli Baar ka Setup','Stock','Billing','Gold Loan (Girvi)','Udhaar, Schemes, Kharche','The Books','Print, Setup, Routine','Andar se kaise bana hai']
P=lambda name: os.path.join(WORK,name)
OUT=P('test.mp4') if TEST else P('brag.mp4')

def bgr_to_i420(bgr):
    """BGR uint8 -> flat I420, BT.709 limited range (inverse of core.to_bgr)."""
    b,g,r=[bgr[...,i].astype(np.float32) for i in range(3)]
    yl=0.2126*r+0.7152*g+0.0722*b
    Y=16+yl*219/255; U=128+(b-yl)/1.8556*224/255; V=128+(r-yl)/1.5748*224/255
    sub=lambda a: cv2.resize(a,(FW//2,FH//2),interpolation=cv2.INTER_AREA)
    return np.concatenate([np.clip(Y+0.5,0,255).astype(np.uint8).ravel(), np.clip(sub(U)+0.5,0,255).astype(np.uint8).ravel(), np.clip(sub(V)+0.5,0,255).astype(np.uint8).ravel()])

total=sum(NFR.values()); mm=lambda s: f'{int(s)//60}:{int(s)%60:02d}'
# 1. poster (frame 0 of the whole video)
pimg=poster.build(total=mm(total/30)); poster_bytes=bgr_to_i420(pimg).tobytes()
cv2.imwrite(P('brag.jpg'), pimg, [cv2.IMWRITE_JPEG_QUALITY, 93])

# 2. audio: decode every episode, cut or pad to exactly its video length, join
if not TEST and not os.path.exists(P('audio.pcm')):
    with open(P('audio.pcm.tmp'),'wb') as f:
        for ep in ORDER:
            pcm=subprocess.run([FF,'-v','error','-i',B+EP[ep]+'/brag.mp4','-vn','-f','s16le','-ar','48000','-ac','2','-'],capture_output=True,check=True).stdout
            want=NFR[ep]*1600*4
            print(f'audio {ep}: decoded {len(pcm)/192000:.4f}s, video {NFR[ep]/30:.4f}s, diff {1000*(len(pcm)-want)/192000:+.1f} ms', flush=True)
            f.write(pcm[:want] if len(pcm)>=want else pcm+b'\0'*(want-len(pcm)))
    os.replace(P('audio.pcm.tmp'),P('audio.pcm'))

# 3. chapters
with open(P('chapters.ffmeta'),'w') as f:
    f.write(';FFMETADATA1\ntitle=OmGold ERP — Poora Software, Ek Video Mein\n'); t=0
    for ep,title in zip(ORDER,TITLES):
        n=NFR[ep]; f.write(f'[CHAPTER]\nTIMEBASE=1/30\nSTART={t}\nEND={t+n}\ntitle={ORDER.index(ep)+1}. {title}\n'); t+=n

# 4. video
patches=make_patches()+[Ep04Convert()]
by_ep={ep:[p for p in patches if p.ep==ep] for ep in ORDER}
# the raw frames are BT.709 limited-range, exactly as decoded: say so on the input and tag (not convert) them,
# otherwise ffmpeg assumes BT.601 for untagged raw video and converts the pixels to BT.709 a second time
CSP=['-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709']
TAG=['-vf','setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709']
cmd=[FF,'-v','error','-y','-f','rawvideo','-pix_fmt','yuv420p','-s',f'{FW}x{FH}','-framerate','30']+CSP+['-i','pipe:0']
if TEST: cmd+=TAG+['-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p']+CSP+[OUT]
else: cmd+=['-f','s16le','-ar','48000','-ac','2','-i',P('audio.pcm'),'-i',P('chapters.ffmeta'),'-map','0:v','-map','1:a','-map_metadata','2','-map_chapters','2']+TAG+[
            '-c:v','libx264','-preset','slow','-crf','22','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv',
            '-c:a','aac','-b:a','160k','-movflags','+faststart',OUT]
enc=subprocess.Popen(cmd, stdin=subprocess.PIPE)
t0=time.time(); written=0; npatched=0
prev_last=None; XF=9                                   # short dissolve from the last frame of one part into the next
def emit(b, k):
    global written
    if prev_last is not None and k < XF:
        a=(k+1)/(XF+1); b=np.clip((1-a)*prev_last+a*np.frombuffer(b,np.uint8).astype(np.float32)+0.5,0,255).astype(np.uint8).tobytes()
    enc.stdin.write(b); written+=1
for ep in ORDER:
    k=0
    n=45 if TEST else NFR[ep]
    dec=subprocess.Popen([FF,'-v','error','-i',B+EP[ep]+'/brag.mp4','-fps_mode','passthrough','-f','rawvideo','-pix_fmt','yuv420p','-'], stdout=subprocess.PIPE)
    for idx in range(n):
        raw=dec.stdout.read(FSZ); assert len(raw)==FSZ, (ep, idx, len(raw))
        if idx==0:
            # frame 0 of each episode file is its own poster: the series poster replaces it at the very start, frame 1 is held elsewhere
            if ep=='ep01': enc.stdin.write(poster_bytes); written+=1
            continue
        buf=np.frombuffer(raw,np.uint8); src=buf
        for p in by_ep[ep]: buf=p.apply(idx, buf)
        if buf is not src: npatched+=1
        b=buf.tobytes()
        if idx==1 and ep!='ep01': emit(b,k); k+=1
        emit(b,k); k+=1
    prev_last=np.frombuffer(b,np.uint8).astype(np.float32)
    if not TEST: assert dec.stdout.read(1)==b'', ep+': more frames than expected'
    dec.kill(); dec.wait()
    print(f'{ep}: done, {written} frames written, {npatched} patched, {time.time()-t0:.0f}s', flush=True)
enc.stdin.close(); rc=enc.wait()
print('encoder exit', rc, 'frames', written, 'expected', (45*9 if TEST else total), 'patched', npatched, f'{time.time()-t0:.0f}s')
for p in patches:
    if getattr(p,'log',None): print(' xf weights', p.ep, p.log)
print('MERGE-DONE' if rc==0 and written==(45*9 if TEST else total) else 'MERGE-FAILED')
