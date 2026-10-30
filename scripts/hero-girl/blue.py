import numpy as np
from PIL import Image
r=np.load('recol.npy').astype(float); bg=np.array([5,15,45.])
L=0.2126*r[...,0]+0.7152*r[...,1]+0.0722*r[...,2]
t=np.clip((L-15)/(165-15),0,1)
stops=[(0,(5,15,45)),(0.12,(10,32,70)),(0.35,(26,72,122)),(0.62,(62,136,188)),(0.82,(104,187,228)),(1,(222,241,250))]
out=np.zeros(r.shape)
for (t0,c0),(t1,c1) in zip(stops,stops[1:]):
    m=(t>=t0)&(t<=t1); f=((t-t0)/(t1-t0))[m][:,None]; out[m]=np.array(c0)*(1-f)+np.array(c1)*f
np.save('recol-blue.npy',out.astype(np.float32))
Image.fromarray(np.clip(out,0,255).astype(np.uint8)).crop((1000,150,2576,1438)).resize((788,644)).save('blue-prev.png')
