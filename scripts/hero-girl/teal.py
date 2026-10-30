import numpy as np
from PIL import Image
r=np.load('recol.npy').astype(float); bg=np.array([3,16,47.])
L=0.2126*r[...,0]+0.7152*r[...,1]+0.0722*r[...,2]
t=np.clip((L-15)/(165-15),0,1)
stops=[(0,(3,16,47)),(0.12,(8,44,74)),(0.35,(24,96,118)),(0.62,(64,168,180)),(0.82,(104,206,214)),(1,(200,244,246))]
out=np.zeros(r.shape)
for (t0,c0),(t1,c1) in zip(stops,stops[1:]):
    m=(t>=t0)&(t<=t1); f=((t-t0)/(t1-t0))[m][:,None]; out[m]=np.array(c0)*(1-f)+np.array(c1)*f
np.save('recol-teal.npy',out.astype(np.float32))
Image.fromarray(np.clip(out,0,255).astype(np.uint8)).crop((1000,150,2576,1438)).resize((788,644)).save('teal-prev.png')
