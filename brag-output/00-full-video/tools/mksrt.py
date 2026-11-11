#!/usr/bin/env python
"""Join the nine brag.hi.srt files into one, shifting each by the start time of its part."""
import re, sys
import os
from core import B, EP, NFR, WORK
ORDER=['ep01','ep02','ep03','ep04','ep05','ep06','ep07','ep08','ep09']
def ts(ms): h,r=divmod(ms,3600000); m,r=divmod(r,60000); s,ms=divmod(r,1000); return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'
def parse(t): h,m,s=t.split(':'); s,ms=s.split(','); return ((int(h)*60+int(m))*60+int(s))*1000+int(ms)
out=[]; n=0; off=0
for ep in ORDER:
    txt=open(B+EP[ep]+'/brag.hi.srt',encoding='utf8').read().strip()
    for block in re.split(r'\n\s*\n', txt):
        lines=block.strip().split('\n'); a,b=[parse(x.strip()) for x in lines[1].split('-->')]
        n+=1; out.append(f'{n}\n{ts(a+off)} --> {ts(b+off)}\n'+'\n'.join(lines[2:])+'\n')
    off+=round(NFR[ep]*1000/30)
open(sys.argv[1] if len(sys.argv)>1 else os.path.join(WORK,'brag.hi.srt'),'w',encoding='utf8').write('\n'.join(out))
print('cues', n, 'last ends', out[-1].split('\n')[1].split('--> ')[1], 'total', ts(off))
