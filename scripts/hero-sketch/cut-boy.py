import numpy as np
from PIL import Image
from scipy import ndimage as nd
im=np.array(Image.open('/home/claude/ose-platform/public/hero/banner.webp').convert('RGBA')).astype(int)
H,W=im.shape[:2]; rgb=im[...,:3]; a=im[...,3].copy(); lum=rgb.mean(-1)
yy,xx=np.mgrid[0:H,0:W]
near=(np.abs(rgb-np.array([66,175,223])).sum(-1)<30)&(a>250)
lab,n=nd.label(near)
big=lab[345,415]
pockets=[lab[628,488],lab[620,577],lab[647,340],lab[640,380],lab[513,680]]
bg=np.isin(lab,[big]+pockets)
bgd=nd.binary_dilation(bg,iterations=1)&(np.abs(rgb-np.array([66,175,223])).sum(-1)<90)
bg|=bgd
cx,cy=419.35,421.18
r=np.hypot(xx-cx,yy-cy); th=(np.degrees(np.arctan2(yy-cy,xx-cx))+360)%360
bins=np.floor(th).astype(int)
rb=np.full(360,np.nan)
for b in range(360):
    m=bg&(bins==b)
    if m.sum()>20: rb[b]=np.percentile(r[m],99.5)
# occluded angles: interpolate (circularly) only from well-formed values
ok=~np.isnan(rb); xsp=np.arange(360)
rbi=np.interp(xsp,np.r_[xsp[ok]-360,xsp[ok],xsp[ok]+360],np.r_[rb[ok],rb[ok],rb[ok]])
rr=nd.median_filter(rbi,size=9,mode='wrap')
R=rr[bins]
band=(r>R-4)&(r<R+34)
figlight=(lum>85)&(a>200)&~bg&~band
near_fig=nd.binary_dilation(figlight,iterations=5)
keep_ang=((th>32)&(th<136))|((th>258)&(th<282))
ring=band&~near_fig&~keep_ang
dk=(lum<60)&(a>150)&band
disk=lambda q: (np.hypot(*np.mgrid[-q:q+1,-q:q+1])<=q)
thick=nd.binary_opening(dk,structure=disk(5))
zone=nd.binary_dilation(thick,iterations=6)&band
ring|=zone&~nd.binary_dilation(figlight,iterations=2)
from PIL import ImageDraw
kp=Image.new('L',(W,H),0); dr=ImageDraw.Draw(kp)
for poly in [[(302,596),(338,596),(338,724),(302,724)],[(344,596),(478,596),(472,676),(456,700),(440,724),(330,764),(318,700)],
             [(517,586),(546,586),(546,792),(517,792)],[(649,520),(676,520),(676,764),(649,764)],[(318,700),(505,700),(505,804),(318,804)]]:
    dr.polygon(poly,fill=255)
keepzone=np.array(kp)>0
ring&=~keepzone
alpha=a.copy()
alpha[bg]=0
alpha[ring]=0
alpha[(a<200)]=0   # the soft glow
# leftover bits of the ring by hand: the ledge the pencils stood on (and the pencils), the arc between the desk legs, a nick by the book
def rect(x0,y0,x1,y1): m=np.zeros((H,W),bool); m[y0:y1,x0:x1]=True; return m
alpha[rect(340,40,450,160)]=0
for rr in [rect(440,596,517,730),rect(546,596,649,730),rect(676,500,712,610),rect(628,598,649,650),rect(270,160,305,210),rect(600,170,640,260)]:
    alpha[rr&(r>R-12)&(r<R+40)&~keepzone]=0
# remove small leftovers of ring: dark specks not near figure light
dark=(lum<70)&(alpha>0)
lab2,n2=nd.label(alpha>0)
sz=nd.sum(alpha>0,lab2,range(1,n2+1)); lt=nd.sum((alpha>0)&(lum>95),lab2,range(1,n2+1))
drop=[i+1 for i in range(n2) if sz[i]<60 or (sz[i]<1500 and lt[i]<25)]
alpha[np.isin(lab2,drop)]=0
out=np.dstack([rgb,alpha]).astype(np.uint8)
Image.fromarray(out).save('cut/boy-cut.png')
# preview on the hero gradient
g=Image.new('RGB',(W,H)); gp=np.zeros((H,W,3))
d=np.hypot(xx-0.8*W,yy-0.3*H)/np.hypot(W,H)
c0=np.array([44,62,176]);c1=np.array([29,40,120]);c2=np.array([15,23,71])
t=np.clip(d/0.85,0,1)[...,None]
gp=np.where(t<0.47,c0+(c1-c0)*(t/0.47),c1+(c2-c1)*((t-0.47)/0.53))
prev=Image.fromarray(gp.astype(np.uint8)).convert('RGBA'); prev.alpha_composite(Image.fromarray(out)); prev.convert('RGB').save('cut/prev.png')

# Update 248: the two flying books (separate pieces above the boy) are dropped as well
lab3,n3=nd.label(out[...,3]>0); sz3=nd.sum(out[...,3]>0,lab3,range(1,n3+1)); main=int(np.argmax(sz3))+1
cs3=nd.center_of_mass(out[...,3]>0,lab3,range(1,n3+1))
out[np.isin(lab3,[i+1 for i,(y,x) in enumerate(cs3) if i+1!=main and y<300]),3]=0
Image.fromarray(out).save('cut/boy-nobooks.png')
