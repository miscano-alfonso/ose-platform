import numpy as np, json
from PIL import Image
from scipy import ndimage as nd
src=np.array(Image.open('src.jpg').convert('RGB')).astype(float)
ref=np.array(Image.open('ref.png').convert('RGB')).astype(float)[:1080,:1345]
lum=lambda c: 0.2126*c[...,0]+0.7152*c[...,1]+0.0722*c[...,2]
sbg=np.array([13,28,51.]); rbg=np.median(ref[:, :150].reshape(-1,3),axis=0); print('ref bg',rbg)
Ls,Lr=lum(src),lum(ref)
# quantile map over every pixel (both images are mostly background, similar content)
qs=np.linspace(0,100,1001)
cs=np.abs(src-sbg).max(-1)>10; cr=np.abs(ref-rbg).max(-1)>10
ps=np.percentile(Ls[cs],qs); pr=np.percentile(Lr[cr],qs)
lsb,lrb=lum(sbg),lum(rbg)
ps=np.r_[lsb,ps]; pr=np.r_[lrb,pr]
Lmap=np.interp(Ls,ps,pr)
# colour per luminance from the reference: median colour in each luminance bin
bins=np.linspace(Lr.min(),Lr.max()+1e-3,129); idx=np.digitize(Lr,bins)-1
cols=np.zeros((128,3)); have=np.zeros(128,bool)
for b in range(128):
    m=idx==b
    if m.sum()>30: cols[b]=np.median(ref[m],axis=0); have[b]=True
cen=(bins[:-1]+bins[1:])/2
for ch in range(3): cols[~have,ch]=np.interp(cen[~have],cen[have],cols[have,ch])
out=np.stack([np.interp(Lmap,cen,cols[:,ch]) for ch in range(3)],-1)
w=np.clip((np.abs(src-sbg).max(-1)-4)/14,0,1)[...,None]
out=rbg*(1-w)+out*w
np.save('recol.npy',out.astype(np.float32))
Image.fromarray(np.clip(out,0,255).astype(np.uint8)).resize((858,479)).save('recol-prev.png')
print('new bg colour', out[20,20], out[600,500])
