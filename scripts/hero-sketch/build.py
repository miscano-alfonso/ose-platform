import re, sys, xml.etree.ElementTree as ET
SVGNS='http://www.w3.org/2000/svg'; ET.register_namespace('',SVGNS)
def s(e): return ET.tostring(e,encoding='unicode').replace(f' xmlns="{SVGNS}"','')
def stroked_only(e):
    if e.tag.endswith('g') and e.get('fill') and e.get('fill')!='none': return False
    return e.get('fill')=='none'
def clone(e): return ET.fromstring(f'<g xmlns="{SVGNS}">{s(e)}</g>')[0]
def black(e):
    c=clone(e)
    for n in c.iter():
        if n.get('fill') not in (None,'none'): n.set('fill','#000')
        if n.get('stroke'): n.set('stroke','#000')
    return s(c)
def line(e,col,w):
    c=clone(e); so=stroked_only(c)
    for n in c.iter():
        sw=float(n.get('stroke-width') or 0)
        n.set('fill','none'); n.set('stroke',col)
        n.set('stroke-width',f'{(min(sw*.8,w*1.6) if so and sw else w):.2f}')
        n.set('stroke-linecap','round'); n.set('stroke-linejoin','round')
    return s(c)
def pencil(src,p='p',col='#e8ebf6',w=1.7):
    body=src[src.index('>',src.index('<svg'))+1:src.rindex('</svg>')]
    body=re.sub(r'<!--.*?-->','',body,flags=re.S)
    els=list(ET.fromstring(f'<g xmlns="{SVGNS}">{body}</g>')); N=len(els)
    dd=[f'<g id="{p}k{i}">{black(e)}</g>' for i,e in enumerate(els) if not stroked_only(e)]
    filled=[i for i,e in enumerate(els) if not stroked_only(e)]
    # u_i = union of the filled shapes drawn after element i
    nxt={}; last=None
    for i in range(N-1,-1,-1):
        nxt[i]=last
        if i in filled: last=i
    made=set()
    def u(i):
        j=nxt[i]
        return None if j is None else j
    for i in range(N-1,-1,-1):
        j=nxt[i]
        if j is None: continue
        inner=f'<use href="#{p}k{j}"/>' + (f'<use href="#{p}u{j}"/>' if nxt[j] is not None else '')
        if f'{p}u{j}' not in made or True:
            pass
        dd.append(f'<g id="{p}v{i}">{inner}</g>') if False else None
    # simpler: build u_j for each filled j = k_j + u_(nxt j)
    for j in reversed(filled):
        inner=f'<use href="#{p}k{j}"/>' + (f'<use href="#{p}u{nxt[j]}"/>' if nxt[j] is not None else '')
        dd.append(f'<g id="{p}u{j}">{inner}</g>')
    for i in range(N):
        if nxt[i] is not None: dd.append(f'<mask id="{p}m{i}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="640" height="560"><rect x="-20" y="-20" width="640" height="560" fill="#fff"/><use href="#{p}u{nxt[i]}"/></mask>')
    def wob(seed,scale,freq=.035):
        return (f'<filter id="{p}w{seed}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{seed}" result="t"/>'
          f'<feDisplacementMap in="SourceGraphic" in2="t" scale="{scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>'
          f'<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="{seed+20}" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.2 1.15" result="ga"/><feComposite in="d" in2="ga" operator="in"/></filter>')
    dd+=[wob(3,2.4),wob(9,3.2)]
    def lines(width,seed,extra=''):
        return f'<g filter="url(#{p}w{seed})"{extra}>'+''.join((f'<g mask="url(#{p}m{i})">' if nxt[i] is not None else '<g>')+line(e,col,width)+'</g>' for i,e in enumerate(els))+'</g>'
    second=lines(w*.6,9,' opacity=".45" transform="translate(1.4 -1)"')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 520" role="img" aria-label="A pencil sketch of a teenager with headphones working at a laptop by a tall window"><defs>'+"".join(dd)+'</defs>'+lines(w,3)+second+'</svg>'
if __name__=='__main__':
    out=pencil(open(sys.argv[1]).read()); open(sys.argv[2],'w').write(out); print(len(out))
