"""Post-production fixes on the rendered episodes (the Hyperframes sources no longer exist).
Each patch maps (frame index, frame buffer) -> patched frame buffer, touching only the app-window content area."""
import numpy as np, cv2
from core import *

def C(ep, idx): return content(read_yuv(ep, idx)[0])

class Unblend:
    """a 12-frame scene cross-fade starting at frame `first`: orig = (1-w)*A + w*B."""
    def __init__(self, ep, first, n=12):
        self.first, self.last = first, first+n-1
        self.A = C(ep, first-1); self.Bn = C(ep, first+n)
    def has(self, idx): return self.first <= idx <= self.last
    def w(self, orig): return min(1.0, max(0.0, fit_w(orig, self.A, self.Bn)))

class CropZoom:
    """view the rect R=(x0,y0,w) of the window content instead of the whole of it, over a frame range.
    ramp_in=(a,b): the rect eases in between frame a (full view) and frame b; ramp_out likewise back to the full view.
    xf_in / xf_out: first frame of a scene cross-fade that the zoomed scene comes in / goes out through."""
    def __init__(self, ep, R, first, last, ramp_in=None, ramp_out=None, xf_in=None, xf_out=None):
        self.ep, self.R, self.first, self.last = ep, R, first, last
        self.ramp_in, self.ramp_out = ramp_in, ramp_out
        self.xin = Unblend(ep, xf_in) if xf_in else None
        self.xout = Unblend(ep, xf_out) if xf_out else None
        self.log = {}
    def apply(self, idx, buf):
        if not (self.first <= idx <= self.last): return buf
        o = content(buf)
        if self.xin and self.xin.has(idx):
            w = self.xin.w(o); self.log[idx] = round(w, 3)
            new = o + w*(cz(self.xin.Bn, *self.R) - self.xin.Bn)
        elif self.xout and self.xout.has(idx):
            w = self.xout.w(o); self.log[idx] = round(w, 3)
            new = o + (1-w)*(cz(self.xout.A, *self.R) - self.xout.A)
        else:
            e = 1.0
            if self.ramp_in and idx < self.ramp_in[1]: e = ease((idx-self.ramp_in[0])/(self.ramp_in[1]-self.ramp_in[0]))
            if self.ramp_out and idx > self.ramp_out[0]: e = 1-ease((idx-self.ramp_out[0])/(self.ramp_out[1]-self.ramp_out[0]))
            if e <= 0: return buf
            new = cz(o, *rect_lerp(self.R, e))
        return put_content(buf, new, o)

def make_patches():
    P = []
    # Video 2, 0:27-0:39 - State field: a strip of the page backdrop showed to the right of the dialog. 1.2x tighter, anchored left.
    P.append(CropZoom('ep02', (0, 75, 1284), 814, 1201, ramp_in=(813, 833), ramp_out=(1182, 1202)))
    # Video 3, 1:01-1:06 - "Billing" in the sidebar was a very small highlight: the pull-back now lands on the left part of the page.
    P.append(CropZoom('ep03', (0, 0, 1045), 1857, 1992, ramp_in=(1856, 1876), xf_out=1981))
    # Video 3, 1:18-1:25 - Stock Transfer status: the whole scene is framed on the table instead of the full page.
    P.append(CropZoom('ep03', (112, 100, 1150), 2341, 2578, xf_in=2341, xf_out=2567))
    # Video 6, 1:02-1:06 - "Total" and "The Books" were very small highlights: push in on the left part of the page.
    P.append(CropZoom('ep06', (0, 0, 1030), 1881, 2004, ramp_in=(1880, 1899), xf_out=1993))
    return P

class Ep04Convert:
    """Video 4, 2:11-2:17 ("Convert to Invoice"): the push-in went 4% too far and cut the page heading at the left edge.
    The camera now stops at the framing of original frame 3947 (sidebar just out of view, heading whole).
    Static screen: from the lit frames 3934 (wide) and 3947, dimmed with the measured spotlight overlay.
    Row with the cursor and the highlight box (the only things that move): from the original frame of the same instant, rescaled."""
    ep = 'ep04'; first, last = 3935, 4113
    KX, KY = 1541.4, 734.1                      # camera family: p_cam = s*p_T + (KX,KY)*(1-s), T = settled tight camera
    S_ORIG = {3934:0.8857,3935:0.8860,3936:0.8864,3937:0.8875,3938:0.8892,3939:0.8918,3940:0.8954,3941:0.9001,3942:0.9062,3943:0.9139,
              3944:0.9233,3945:0.9344,3946:0.9475,3947:0.9597,3948:0.9700,3949:0.9784,3950:0.9853,3951:0.9907,3952:0.9949,3953:0.9978,3954:1.0,
              3955:1.00144,3956:1.00216,3957:1.00257}
    S_END = 1.0026                              # the move only settles at frame 3958, while the spotlight is already fading in
    U = {3955:0.285,3956:0.495,3957:0.659,3958:0.773,3959:0.861,3960:0.931,3961:0.967,3962:0.995,3963:1.0}   # spotlight fade-in
    DIM = (0.5375, 15.37, 56.82, 61.13)        # dimmed = a*lit + b (Y,U,V): 46% overlay of the dark brown
    BAND = (590, 395, 575)                      # T coords: x >= 590, 395 <= y <= 575
    def __init__(self):
        self.sW, self.sK = self.S_ORIG[3934], self.S_ORIG[3947]
        self.W0 = C(self.ep, 3934); self.BASE = C(self.ep, 3947)
        a, bY, bU, bV = self.DIM
        self.BASE_DIM = self.BASE*a + np.float32([bY, bU, bV])
        self.xf = Unblend(self.ep, 4102)
        self.A_new = self.compose(4101, self.xf.A)
        self.log = {}
    def s_orig(self, j): return self.S_ORIG.get(j, self.S_END)
    def s_new(self, j):
        e = (self.s_orig(j)-self.sW)/(self.S_END-self.sW)  # same timing and easing as the original move, shorter travel
        return self.sW + (self.sK-self.sW)*e
    def warp(self, img, sa, sb, lin=False, border=cv2.BORDER_REPLICATE):
        r = sa/sb; ta = (self.KX*(1-sa), self.KY*(1-sa)); tb = (self.KX*(1-sb), self.KY*(1-sb))
        M = np.float32([[r,0,ta[0]-r*tb[0]],[0,r,ta[1]-r*tb[1]]])
        return cv2.warpAffine(img, M, (W,H), flags=(cv2.INTER_LINEAR if lin else cv2.INTER_LANCZOS4)|cv2.WARP_INVERSE_MAP, borderMode=border, borderValue=0)
    def band_mask(self, sb):
        x0, y0, y1 = self.BAND; tx, ty = self.KX*(1-sb), self.KY*(1-sb); f = 12.0
        xx = np.arange(W, dtype=np.float32)[None,:]; yy = np.arange(H, dtype=np.float32)[:,None]
        mx = np.clip((xx-(sb*x0+tx))/f, 0, 1); my = np.clip(np.minimum(yy-(sb*y0+ty), (sb*y1+ty)-yy)/f, 0, 1)
        return (mx*my)[...,None]
    def static_lit(self, sb):
        if abs(sb-self.sK) < 1e-6: return self.BASE
        S = self.warp(self.W0, self.sW, sb)
        v = self.warp(np.ones((H,W),np.float32), self.sK, sb, lin=True, border=cv2.BORDER_CONSTANT)
        v = cv2.GaussianBlur(cv2.erode((v>0.999).astype(np.float32), np.ones((17,17),np.uint8)), (0,0), 3)[...,None]
        return S*(1-v) + self.warp(self.BASE, self.sK, sb)*v
    def compose(self, j, o):
        sb = self.s_new(j)
        if j >= 3964: S = self.BASE_DIM
        else:
            S = self.static_lit(sb); u = self.U.get(j, 0.0)
            if u > 0: S = (1-u)*S + u*(S*self.DIM[0] + np.float32(self.DIM[1:]))
        live = self.warp(o, self.s_orig(j), sb); m = self.band_mask(sb)
        return S*(1-m) + live*m
    def apply(self, idx, buf):
        if not (self.first <= idx <= self.last): return buf
        o = content(buf)
        if self.xf.has(idx):
            w = self.xf.w(o); self.log[idx] = round(w, 3); new = o + (1-w)*(self.A_new - self.xf.A)
        else: new = self.compose(idx, o)
        return put_content(buf, new, o)
