import numpy as np
from PIL import Image
from scipy import ndimage as nd
a=np.array(Image.open('src.jpg').convert('RGB')).astype(int)
H,W=a.shape[:2]; bg=np.array([13,28,51])
diff=np.abs(a-bg).max(-1)
m=diff>14
md=nd.binary_dilation(m,iterations=7)
lab,n=nd.label(md); sz=nd.sum(m,lab,range(1,n+1))
big=int(np.argmax(sz))+1
objs=nd.find_objects(lab)
v=(a*0.5).astype(np.uint8); v[lab==big]=(200,60,60)
info=[]
for i,sl in enumerate(objs,1):
    if i==big or sz[i-1]<40: continue
    y0,y1,x0,x1=sl[0].start,sl[0].stop,sl[1].start,sl[1].stop
    info.append((i,int(sz[i-1]),x0,y0,x1,y1))
print('figure bbox',objs[big-1]); print(len(info)); [print(x) for x in info]
Image.fromarray(v).resize((W//3,H//3)).save('seg.png')
np.save('lab.npy',lab); open('big.txt','w').write(str(big))
