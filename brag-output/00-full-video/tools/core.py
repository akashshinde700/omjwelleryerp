"""Shared helpers: paths, frame access (bit-exact, frame-accurate) and the app-window geometry of the rendered videos."""
import os, subprocess, numpy as np, cv2
HERE=os.path.dirname(os.path.abspath(__file__))
FF=os.environ.get('FFMPEG','ffmpeg')                                             # an ffmpeg with libx264 and aac
B=os.path.join(os.environ.get('BRAG_OUT', os.path.abspath(os.path.join(HERE,'..','..'))),'')   # the brag-output folder
WORK=os.environ.get('WORK', os.path.join(os.getcwd(),'work')); os.makedirs(WORK, exist_ok=True)   # scratch + results
EP={'ep01':'01-software-ki-pehchaan','ep02':'02-pehli-baar-ka-setup','ep03':'03-stock','ep04':'04-billing','ep05':'05-gold-loan-girvi','ep06':'06-udhaar-schemes-kharche','ep07':'07-the-books','ep08':'08-print-setup-routine','ep09':'09-andar-se-kaise-bana-hai'}
NFR={'ep01':3634,'ep02':3255,'ep03':3381,'ep04':5190,'ep05':3043,'ep06':2602,'ep07':2982,'ep08':2496,'ep09':5253}
FW,FH=1920,1080; FSZ=FW*FH*3//2
X0,Y0,W,H=192,88,1536,864                      # content area of the app window inside the 1920x1080 frame

def read_yuv(ep, a, n=1):
    """n consecutive frames starting at index a, as flat I420 uint8 arrays (frame-accurate seek)."""
    cmd=[FF,'-v','error','-ss',f'{max(0,(a-0.5)/30):.5f}','-i',B+EP[ep]+'/brag.mp4','-frames:v',str(n),'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','yuv420p','-']
    raw=subprocess.run(cmd,capture_output=True,check=True).stdout
    assert len(raw)==n*FSZ,(ep,a,n,len(raw))
    return [np.frombuffer(raw[i*FSZ:(i+1)*FSZ],np.uint8) for i in range(n)]

def planes(buf):
    y=buf[:FW*FH].reshape(FH,FW); u=buf[FW*FH:FW*FH*5//4].reshape(FH//2,FW//2); v=buf[FW*FH*5//4:].reshape(FH//2,FW//2); return y,u,v
def content(buf):
    """content area of a frame as float32 YUV444 (H,W,3): Y, U, V (chroma upsampled). All patch maths is linear, so it is done in this space."""
    y,u,v=planes(buf)
    Y=y[Y0:Y0+H,X0:X0+W].astype(np.float32)
    U=cv2.resize(u[Y0//2:(Y0+H)//2,X0//2:(X0+W)//2].astype(np.float32),(W,H),interpolation=cv2.INTER_NEAREST)
    V=cv2.resize(v[Y0//2:(Y0+H)//2,X0//2:(X0+W)//2].astype(np.float32),(W,H),interpolation=cv2.INTER_NEAREST)
    return np.dstack([Y,U,V])
def to_bgr(c):
    """YUV444 float (limited range, BT.709) -> BGR uint8, for previews only."""
    Y=(c[...,0]-16)*1.164383; U=c[...,1]-128; V=c[...,2]-128
    r=Y+1.792741*V; g=Y-0.213249*U-0.532909*V; b=Y+2.112402*U
    return np.clip(np.dstack([b,g,r]),0,255).astype(np.uint8)

# rounded bottom corners of the window: keep original pixels outside the radius
def _mask():
    m=np.ones((H,W),np.float32); r=13.0
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    for cx in (r-0.5, W-0.5-r):
        cy=H-0.5-r
        d=np.hypot(xx-cx, yy-cy)
        corner=(yy>cy)&((xx<cx) if cx<W/2 else (xx>cx))
        m[corner]=np.clip(r-d[corner]+0.5,0,1)
    return m[...,None]
MASK=_mask()

def put_content(buf, new, orig=None):
    """return a copy of frame buf with its content area replaced by `new` (float YUV444)."""
    if orig is None: orig=content(buf)
    out=MASK*new+(1-MASK)*orig
    res=buf.copy(); y,u,v=planes(res)
    y[Y0:Y0+H,X0:X0+W]=np.clip(out[...,0]+0.5,0,255).astype(np.uint8)
    u[Y0//2:(Y0+H)//2,X0//2:(X0+W)//2]=np.clip(cv2.resize(out[...,1],(W//2,H//2),interpolation=cv2.INTER_AREA)+0.5,0,255).astype(np.uint8)
    v[Y0//2:(Y0+H)//2,X0//2:(X0+W)//2]=np.clip(cv2.resize(out[...,2],(W//2,H//2),interpolation=cv2.INTER_AREA)+0.5,0,255).astype(np.uint8)
    return res

def ease(t):
    t=min(1.0,max(0.0,t)); return 2*t*t if t<0.5 else 1-2*(1-t)*(1-t)

def cz(img, x0, y0, w, sharpen=True):
    """crop-zoom: view the rect [x0,y0,w,w*9/16] of img, scaled to W x H (Lanczos; mild unsharp when magnifying)."""
    z=W/w
    if abs(z-1)<1e-6 and abs(x0)<1e-6 and abs(y0)<1e-6: return img
    M=np.float32([[1/z,0,x0+0.5/z-0.5],[0,1/z,y0+0.5/z-0.5]])
    out=cv2.warpAffine(img, M, (W,H), flags=cv2.INTER_LANCZOS4|cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    if sharpen and z>1.02:
        amt=min(0.5,1.1*(z-1)); bl=cv2.GaussianBlur(out,(0,0),1.0+0.5*(z-1)); out=out+amt*(out-bl)
    return out

def rect_lerp(R, e):
    """interpolate from the full view [0,0,W] to rect R=(x0,y0,w)."""
    return (e*R[0], e*R[1], W+e*(R[2]-W))

def fit_w(orig, A, Bn):
    """weight w of Bn in orig ~= (1-w)*A + w*Bn."""
    d=(Bn-A).ravel(); return float(np.dot((orig-A).ravel(), d)/np.dot(d,d))
