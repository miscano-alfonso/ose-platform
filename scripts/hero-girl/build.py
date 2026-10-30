import numpy as np, json, math
from PIL import Image
from scipy import ndimage as nd
import sys
rec=np.load(sys.argv[1] if len(sys.argv)>1 else 'recol.npy').astype(float); H,W=rec.shape[:2]
rbg=np.array([3,16,47.])
lab=np.load('lab.npy'); big=int(open('big.txt').read())
fig=lab==big; sym=(lab>0)&~fig
CX=1030   # the plate starts here: the girl and the symbols around her
plate=rec.copy()
plate[nd.binary_dilation(sym,iterations=4)&~fig]=rbg
Image.fromarray(np.clip(plate[:,CX:],0,255).astype(np.uint8)).save('web/girl.webp','WEBP',quality=82,method=6)
PW=W-CX
grp,ng=nd.label(nd.binary_dilation(sym,iterations=16)&~nd.binary_dilation(fig,iterations=2))
inbox,outside=[],[]
k=0
for i,s in enumerate(nd.find_objects(grp),1):
    if s is None: continue
    m=(grp==i)&sym
    if m.sum()<40: continue
    yy,xx=np.nonzero(m); y0,y1,x0,x1=yy.min()-5,yy.max()+6,xx.min()-5,xx.max()+6
    c=rec[y0:y1,x0:x1]; mm=nd.binary_dilation(m,iterations=3)[y0:y1,x0:x1]
    d=np.abs(c-rbg).max(-1); al=np.clip(d/70,0,1)*mm
    un=rbg+(c-rbg)/np.maximum(al[...,None],1e-3)
    un=rbg+(un-rbg)*1.15                      # a touch brighter so every symbol reads
    sp=np.dstack([np.clip(un,0,255),al*255]).astype(np.uint8)
    im=Image.fromarray(sp); im=im.resize((max(1,round(im.width*.6)),max(1,round(im.height*.6))),Image.LANCZOS)
    im.save(f'web/s{k}.webp','WEBP',quality=88,method=6)
    e={'f':f's{k}','x':0,'y':0,'w':0}
    if x0>=CX: e.update(x=float(round((x0-CX)/PW*100,2)),y=float(round(y0/H*100,2)),w=float(round((x1-x0)/PW*100,2))); inbox.append(e)
    else: e.update(srcw=int(x1-x0)); outside.append(e)
    k+=1
json.dump({'pw':PW,'ph':H,'inbox':inbox,'outside':outside},open('web/meta.json','w'),indent=0)
print(len(inbox),'in box',len(outside),'outside', [o['f'] for o in outside])
