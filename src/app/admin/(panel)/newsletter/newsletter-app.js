// @ts-nocheck
/* Admin → Newsletter, Subscribers and Email stats: the front end. A port of the Giles website's newsletter section
   (Oct 2026): the same plain-JS rendering into one element. "Books" are our courses and workshops (BOOT.items). */
export function mountNewsletter(app, BOOT, page){
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={books:BOOT.items||[]};
const bookById=id=>state.books.find(b=>b.id===id)||null;
const stLabel=x=>x.status==='next'?'next year':x.status==='space'?'space available':x.status==='workshop'?'workshop':'full';
const sorted=()=>[...state.books].sort((a,b)=>String(a.title).localeCompare(String(b.title)));
function fmtDate(iso,short){if(!iso)return '';const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso);if(!m)return iso;const mo=MONTHS[+m[2]-1];const name=short?mo.slice(0,3):mo;return (+m[3])+' '+name+' '+m[1]}
function fmtStamp(t){if(!t)return '';const d=new Date(t);return isNaN(d)?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
let toastT=0;function toast(m){let t=document.getElementById('nl-toast');if(!t){t=document.createElement('div');t.id='nl-toast';t.className='soc-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),4000)}
async function api(action,payload,isForm){
  const opt={method:payload?'POST':'GET',credentials:'same-origin',headers:{}};
  if(payload){if(isForm)opt.body=payload;else{opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(payload)}}
  let r;try{r=await fetch('/admin/newsletter-api?action='+action,opt)}catch(_){throw new Error('No connection to the server')}
  let j={};try{j=await r.json()}catch(_){}
  if(!r.ok||j.error)throw new Error(j.error||(r.status===401?'Sign in to the admin again.':'Server error '+r.status));
  return j}
/* pictures are made into JPEGs in the browser and kept on the server, where email clients can fetch them */
async function uploadFile(f){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(f.type))throw new Error('Choose a JPEG, PNG or WebP picture.');
  if(f.size>20*1024*1024)throw new Error('That picture is over 20MB.');
  const u=URL.createObjectURL(f);try{const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('That picture couldn’t be read.'));i.src=u});
    const s=Math.min(1,1600/im.naturalWidth),cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*s);cv.height=Math.round(im.naturalHeight*s);
    const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(im,0,0,cv.width,cv.height);
    const bl=await new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('Couldn’t make the picture.')),'image/jpeg',.88));
    const fd=new FormData();fd.append('file',bl,'email.jpg');return await api('upload',fd,true)}finally{URL.revokeObjectURL(u)}}
const EM={list:null,err:'',doc:null,sel:null,view:'desktop',saving:'',dirty:false,t:0,pt:0,adding:false,confirmDel:null};
const EM_BLOCKS={
  header:{l:'Header',d:'Logo bar'},
  hero:{l:'Headline',d:'Big title with an introduction'},
  text:{l:'Text',d:'A heading and paragraphs'},
  books:{l:'Course grid',d:'Two or three courses per row'},
  feature:{l:'Featured course',d:'One course, large'},
  offer:{l:'Offer',d:'Discount code and terms'},
  button:{l:'Button',d:'A link button'},
  image:{l:'Image',d:'A picture, optionally linked'},
  divider:{l:'Divider',d:'A thin line'},
  footer:{l:'Footer',d:'Address and unsubscribe'}};
const EM_FIELDS={
  header:[['tagline','text','Line under the logo']],
  hero:[['eyebrow','text','Small label above'],['heading','text','Headline'],['text','area','Introduction'],['image','image','Picture (optional)'],['bg','select','Background',[['brand','Navy'],['paper','Light'],['lime','Mustard']]]],
  text:[['heading','text','Heading (optional)'],['body','area','Text (leave a blank line between paragraphs)']],
  books:[['heading','text','Heading'],['intro','area','Introduction (optional)'],['ids','books','Courses'],['cols','select','Per row',[['2','Two'],['3','Three']]],['price','select','Show price',[['yes','Yes'],['no','No']]]],
  feature:[['label','text','Small label'],['id','book','Course or workshop'],['blurb','area','Why it matters (leave empty to use the course summary)'],['button','text','Button text']],
  offer:[['heading','text','Heading'],['text','area','Offer details'],['code','text','Discount code'],['expires','text','Valid until'],['button','text','Button text'],['url','text','Button link'],['terms','area','Small print']],
  button:[['label','text','Button text'],['url','text','Link']],
  image:[['src','image','Picture'],['alt','text','Description (for screen readers)'],['href','text','Link (optional)']],
  divider:[],
  footer:[['text','area','Message'],['address','text','Address line']]};
const emUid=()=>Math.random().toString(36).slice(2,9);
const emSiteBase=()=>BOOT.base+'/';
const emAbs=u=>!u?'':/^(https?:|mailto:)/i.test(u)?u:emSiteBase()+String(u).replace(/^\.?\//,'');
const emBookUrl=b=>emSiteBase()+String(b.link||'courses').replace(/^\//,'');
// tracked links/opens (only in the exported email, never the preview or the test send)
let EM_TRACK=null;
const emL=(u,l)=>EM_TRACK?emSiteBase()+'newsletter/c?e='+EM_TRACK+'&s=*|UNIQID|*&l='+encodeURIComponent(String(l||'').slice(0,80))+'&u='+encodeURIComponent(u):u;
const emSeason=()=>{const d=new Date(),m=d.getMonth(),y=d.getFullYear();return m<3?'Spring term '+y:m<7?'Summer term '+y:m<8?'Summer '+y:'Autumn term '+y};
function emPick(kind,n){ // kind: space | next | workshop
  return [...state.books].filter(b=>!kind||b.status===kind).sort((a,b)=>kind==='workshop'?String(a.pubDate).localeCompare(String(b.pubDate)):0).slice(0,n||12).map(b=>b.id)}
const EM_FOOT=()=>({type:'footer',text:'You are receiving this because you asked to hear about courses and news from OH-SO ED.',address:'OH-SO ED Online School · Oh-so Educate Ltd · United Kingdom'});
const EM_TAG='Online school for home-educated students';
const EM_TEMPLATES={
  space:{l:'Space available',d:'Courses with places this term',make:()=>{const ids=emPick('space',9);return {
    name:'Space available · '+emSeason(),subject:'Space available on our live online courses',preheader:'There are still places on these OH-SO ED courses. Book a free taster to try a lesson.',
    blocks:[{type:'header',tagline:EM_TAG},
      {type:'hero',eyebrow:'Space available · '+emSeason(),heading:'There’s still space in these classes',text:'Live online lessons for home-educated students, taught by experienced secondary subject specialists in small groups. Book a place, or try a free taster lesson first.',bg:'brand'},
      {type:'books',heading:'Courses with space',intro:'',ids,cols:'3',price:'yes'},
      {type:'button',label:'Book a free taster',url:'/contact'},EM_FOOT()]}}},
  nextyear:{l:'Enrolling for next year',d:'Next year’s courses, open now',make:()=>{const ids=emPick('next',9);return {
    name:'Next year · '+emSeason(),subject:'Now enrolling for September',preheader:'Places on next year’s OH-SO ED courses are open now.',
    blocks:[{type:'header',tagline:EM_TAG},
      {type:'hero',eyebrow:'Now enrolling',heading:'Next year’s courses are open',text:'Secure a place on next year’s KS3, pre-GCSE, GCSE and A-Level courses now. Families who book early keep their place in the class.',bg:'brand'},
      ...(ids[0]?[{type:'feature',label:'New for September',id:ids[0],blurb:'',button:'Find out more'}]:[]),
      {type:'books',heading:'Also enrolling',intro:'',ids:ids.slice(1),cols:'3',price:'yes'},
      {type:'button',label:'See all courses',url:'/courses'},EM_FOOT()]}}},
  workshops:{l:'Upcoming workshops',d:'One-off sessions, soonest first',make:()=>{const ids=emPick('workshop',6);return {
    name:'Workshops · '+emSeason(),subject:'Upcoming workshops at OH-SO ED',preheader:'One-off live workshops, open to every family. Places are limited.',
    blocks:[{type:'header',tagline:EM_TAG},
      {type:'hero',eyebrow:'Workshops',heading:'Coming up',text:'One-off live sessions with our subject specialists, open to every family, whether or not you study with us. Places are limited.',bg:'paper'},
      {type:'books',heading:'Book a place',intro:'',ids,cols:'2',price:'yes'},
      {type:'button',label:'See all workshops',url:'/other-services'},EM_FOOT()]}}},
  holidays:{l:'Happy Holidays',d:'Season’s greetings and term dates',make:()=>{const y=new Date().getFullYear();return {
    name:'Happy Holidays '+y,subject:'Happy Holidays from OH-SO ED',preheader:'With thanks for a wonderful term, and the dates for next term.',
    blocks:[{type:'header',tagline:EM_TAG},
      {type:'hero',eyebrow:'Season’s greetings',heading:'Happy Holidays',text:'Thank you to every student and family for a wonderful term. Everyone at OH-SO ED wishes you a restful break and a very happy new year.',bg:'lime'},
      {type:'text',heading:'Term dates',body:'Lessons finish for the holidays at the end of this week and start again in January. You’ll find every date for the year on our website.'},
      {type:'button',label:'See the term dates',url:'/term-dates'},
      {type:'books',heading:'Space in the new year',intro:'A few classes still have places for next term.',ids:emPick('space',6),cols:'3',price:'yes'},EM_FOOT()]}}},
  offer:{l:'Special offer',d:'A discount code with terms',make:()=>{const d=new Date();d.setMonth(d.getMonth()+1);return {
    name:'Offer · '+emSeason(),subject:'A special offer from OH-SO ED',preheader:'Book a course before the offer ends and save.',
    blocks:[{type:'header',tagline:EM_TAG},
      {type:'hero',eyebrow:'Special offer',heading:'Book now and save',text:'Book any course before the offer ends and the discount is taken off at checkout. Bundle discounts still apply when you take three or more courses.',bg:'brand'},
      {type:'offer',heading:'10% off',text:'Use this code at checkout.',code:'',expires:fmtDate(d.toISOString().slice(0,10)),button:'Book now',url:'/courses',terms:'One code per family. Cannot be combined with other offers.'},
      {type:'books',heading:'Courses with space',intro:'',ids:emPick('space',6),cols:'3',price:'yes'},EM_FOOT()]}}},
  blank:{l:'Blank email',d:'Start with just a header and footer',make:()=>({name:'New email',subject:'',preheader:'',blocks:[{type:'header',tagline:EM_TAG},{type:'text',heading:'',body:''},EM_FOOT()]})}};

/* email-safe HTML: tables, inline styles, web fonts with safe fallbacks */
const EMC={brand:'#0F1747',deep:'#0A1033',lime:'#E3CD4B',paper:'#F3F4FA',ink:'#171B2B',muted:'#5C6378',rule:'#DFE2EA'};
const EMF={display:"Jost,'Trebuchet MS',Helvetica,Arial,sans-serif",body:"Helvetica,Arial,sans-serif",mono:"Helvetica,Arial,sans-serif"};
const emE=s=>esc(s);
const emParas=(s,st)=>String(s||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).map(p=>`<p style="margin:0 0 14px;${st}">${emE(p).replace(/\n/g,'<br>')}</p>`).join('');
function emBtn(label,url,dark){if(!label)return '';return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td style="border-radius:999px;background:${dark?EMC.lime:EMC.brand}"><a href="${emE(emL(emAbs(url||'/courses'),'Button: '+label))}" style="display:inline-block;padding:13px 28px;font:600 15px/1 ${EMF.body};color:${dark?EMC.deep:'#ffffff'};text-decoration:none;border-radius:999px">${emE(label)}</a></td></tr></table>`}
function emPrice(b){return b.price||''}
function emBlock(k,bl){
  const pad='padding:0 40px';
  switch(bl.type){
  case 'header':return `<tr><td style="background:${EMC.brand};padding:24px 40px" align="left"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><a href="${emE(emL(emSiteBase(),'Website'))}" style="text-decoration:none"><img src="${emE(emSiteBase()+'brand/logo')}" width="150" alt="OH-SO ED" style="display:block;border:0;width:150px;height:auto"></a></td>${bl.tagline?`<td valign="middle" style="padding-left:18px"><div style="border-left:1px solid #3A4380;padding-left:16px;font:500 11px/1.4 ${EMF.body};letter-spacing:2px;text-transform:uppercase;color:#C9CDE4">${emE(bl.tagline)}</div></td>`:''}</tr></table></td></tr>`;
  case 'hero':{const bg=bl.bg==='paper'?EMC.paper:bl.bg==='lime'?EMC.lime:EMC.brand,dark=bl.bg==='brand'||!bl.bg,hc=dark?EMC.lime:EMC.deep,tc=dark?'#ffffff':EMC.ink,ec=dark?'#C9CDE4':EMC.brand;
    return `<tr><td style="background:${bg};padding:${k===1?'14px':'40px'} 40px 40px">${bl.image?`<img src="${emE(emAbs(bl.image))}" width="520" alt="" style="display:block;width:100%;max-width:100%;height:auto;border:0;margin:0 0 26px">`:''}${bl.eyebrow?`<div style="font:500 12px/1.4 ${EMF.mono};letter-spacing:2px;text-transform:uppercase;color:${ec};margin:0 0 12px">${emE(bl.eyebrow)}</div>`:''}${bl.heading?`<h1 class="em-h1" style="margin:0 0 16px;font:600 42px/1.08 ${EMF.display};color:${hc};letter-spacing:-0.5px">${emE(bl.heading)}</h1>`:''}${emParas(bl.text,`font:400 17px/1.55 ${EMF.body};color:${tc}`)}</td></tr>`}
  case 'text':return `<tr><td style="${pad};padding-top:30px;padding-bottom:16px">${bl.heading?`<h2 style="margin:0 0 12px;font:600 26px/1.2 ${EMF.display};color:${EMC.brand}">${emE(bl.heading)}</h2>`:''}${emParas(bl.body,`font:400 16px/1.6 ${EMF.body};color:${EMC.ink}`)}</td></tr>`;
  case 'books':{const ids=(bl.ids||[]).map(bookById).filter(Boolean);if(!ids.length)return bl.heading?`<tr><td style="${pad};padding-top:30px"><h2 style="margin:0;font:600 26px/1.2 ${EMF.display};color:${EMC.brand}">${emE(bl.heading)}</h2></td></tr>`:'';
    const n=bl.cols==='3'?3:2,w=n===3?30:48,gp=n===3?5:4,px=n===3?230:340;
    const cell=b=>`<td class="em-col" width="${w}%" valign="top" style="width:${w}%;padding:0 0 28px"><a href="${emE(emL(emBookUrl(b),'Course: '+b.title))}" style="text-decoration:none;color:${EMC.ink}">${b.cover?`<img src="${emE(emAbs(b.cover))}" width="${px}" alt="" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:8px;border-bottom:6px solid ${emE(b.tileColor||EMC.brand)}">`:`<div style="height:8px;border-radius:4px;background:${emE(b.tileColor||EMC.brand)}"></div>`}<div style="margin:14px 0 4px;font:600 ${n===3?16:18}px/1.25 ${EMF.display};color:${EMC.ink}">${emE(b.title)}</div>${b.subtitle?`<div style="font:400 14px/1.35 ${EMF.body};color:${EMC.muted};margin:0 0 6px">${emE(b.subtitle)}</div>`:''}<div style="font:400 13px/1.4 ${EMF.mono};color:${EMC.muted}">${emE([b.partner?'with '+b.partner:'',b.status==='next'&&b.pubDate?'starts '+fmtDate(b.pubDate,true):b.status==='workshop'&&b.pubDate?fmtDate(b.pubDate,false):''].filter(Boolean).join(' · '))}</div>${bl.price!=='no'&&emPrice(b)?`<div style="margin-top:6px;font:600 14px/1.3 ${EMF.body};color:${EMC.brand}">${emPrice(b)}</div>`:''}</a></td>`;
    const rows=[];for(let i=0;i<ids.length;i+=n){const r=ids.slice(i,i+n);rows.push(`<tr>${r.map((b,j)=>cell(b)+(j<n-1?`<td class="em-gap" width="${gp}%" style="width:${gp}%">&nbsp;</td>`:'')).join('')}${r.length<n?'<td colspan="'+((n-r.length)*2-1)+'">&nbsp;</td>':''}</tr>`)}
    return `<tr><td style="${pad};padding-top:32px">${bl.heading?`<h2 style="margin:0 0 ${bl.intro?'10':'22'}px;font:600 26px/1.2 ${EMF.display};color:${EMC.brand}">${emE(bl.heading)}</h2>`:''}${bl.intro?emParas(bl.intro,`font:400 16px/1.55 ${EMF.body};color:${EMC.ink}`):''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join('')}</table></td></tr>`}
  case 'feature':{const b=bookById(bl.id);if(!b)return '';const blurb=bl.blurb||String(b.summary||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    return `<tr><td style="${pad};padding-top:36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="em-col" width="36%" valign="top" style="width:36%"><a href="${emE(emL(emBookUrl(b),'Course: '+b.title))}">${b.cover?`<img src="${emE(emAbs(b.cover))}" width="260" alt="" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:10px;border-bottom:8px solid ${emE(b.tileColor||EMC.brand)}">`:''}</a></td><td class="em-gap" width="5%" style="width:5%">&nbsp;</td><td class="em-col" valign="top">${bl.label?`<div style="font:500 12px/1.4 ${EMF.mono};letter-spacing:2px;text-transform:uppercase;color:${EMC.brand};margin:0 0 10px">${emE(bl.label)}</div>`:''}<h2 style="margin:0 0 8px;font:600 28px/1.15 ${EMF.display};color:${EMC.ink}">${emE(b.title)}</h2>${b.subtitle?`<div style="font:400 16px/1.4 ${EMF.display};color:${EMC.muted};margin:0 0 10px">${emE(b.subtitle)}</div>`:''}${b.partner?`<div style="font:400 13px/1.4 ${EMF.mono};color:${EMC.muted};margin:0 0 14px">Taught by ${emE(b.partner)}</div>`:''}${blurb?`<p style="margin:0 0 18px;font:400 15px/1.55 ${EMF.body};color:${EMC.ink}">${emE(blurb.length>320?blurb.slice(0,317).replace(/\s+\S*$/,'')+'…':blurb)}</p>`:''}${emPrice(b)?`<div style="font:600 16px/1 ${EMF.body};color:${EMC.brand};margin:0 0 18px">${emPrice(b)}</div>`:''}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${EMC.brand}"><a href="${emE(emL(emBookUrl(b),'Course: '+b.title))}" style="display:inline-block;padding:12px 24px;font:600 14px/1 ${EMF.body};color:#fff;text-decoration:none">${emE(bl.button||'Find out more')}</a></td></tr></table></td></tr></table></td></tr>`}
  case 'offer':return `<tr><td style="${pad};padding-top:32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMC.deep};border-radius:12px"><tr><td align="center" style="padding:34px 30px">${bl.heading?`<h2 style="margin:0 0 10px;font:600 34px/1.1 ${EMF.display};color:${EMC.lime}">${emE(bl.heading)}</h2>`:''}${emParas(bl.text,`font:400 16px/1.5 ${EMF.body};color:#ffffff`)}${bl.code?`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px auto 12px"><tr><td style="border:2px dashed ${EMC.lime};border-radius:8px;padding:12px 26px;font:700 24px/1 ${EMF.mono};letter-spacing:4px;color:${EMC.lime}">${emE(bl.code)}</td></tr></table>`:''}${bl.expires?`<div style="font:400 13px/1.4 ${EMF.body};color:#C9CDE4;margin:0 0 20px">Valid until ${emE(bl.expires)}</div>`:''}${emBtn(bl.button,bl.url,true)}${bl.terms?`<div style="margin-top:20px;font:400 12px/1.5 ${EMF.body};color:#C9CDE4">${emE(bl.terms)}</div>`:''}</td></tr></table></td></tr>`;
  case 'button':return `<tr><td align="center" style="${pad};padding-top:12px;padding-bottom:34px">${emBtn(bl.label,bl.url)}</td></tr>`;
  case 'image':{if(!bl.src)return '';const img=`<img src="${emE(emAbs(bl.src))}" width="520" alt="${emE(bl.alt||'')}" style="display:block;width:100%;max-width:100%;height:auto;border:0">`;return `<tr><td style="${pad};padding-top:28px">${bl.href?`<a href="${emE(emL(emAbs(bl.href),'Image'))}">${img}</a>`:img}</td></tr>`}
  case 'divider':return `<tr><td style="${pad};padding-top:20px;padding-bottom:20px"><div style="border-top:1px solid ${EMC.rule};font-size:0;line-height:0">&nbsp;</div></td></tr>`;
  case 'footer':return `<tr><td style="background:${EMC.deep};padding:30px 40px" align="left">${emParas(bl.text,`font:400 13px/1.55 ${EMF.body};color:#C9CDE4`)}<p style="margin:0 0 14px;font:400 13px/1.55 ${EMF.body};color:#C9CDE4"><a href="${emE(emL(emSiteBase(),'Website'))}" style="color:#ffffff">${emE(emSiteBase().replace(/^https?:\/\//,'').replace(/\/$/,''))}</a> &nbsp;·&nbsp; <a href="${emE(emL('https://www.facebook.com/ohsoedonline','Facebook'))}" style="color:#ffffff">Facebook</a></p>${bl.address?`<p style="margin:0 0 6px;font:400 12px/1.5 ${EMF.mono};color:#8D93B8">${emE(bl.address)}</p>`:''}<p style="margin:0;font:400 12px/1.5 ${EMF.body};color:#8D93B8">${EM_ESP==='brevo'?'<a href="{{ unsubscribe }}" style="color:#8D93B8">Unsubscribe</a>':'<a href="*|UNSUB|*" style="color:#8D93B8">Unsubscribe</a> &nbsp;·&nbsp; <a href="*|UPDATE_PROFILE|*" style="color:#8D93B8">Update preferences</a>'}</p></td></tr>`;
  }return ''}
// mode: false = preview/test, true = exported for Mailchimp (our tracking), 'brevo' = sent through Brevo (Brevo tracks)
let EM_ESP='';
function emailHTML(doc,mode){EM_TRACK=mode===true&&doc.id?doc.id:null;EM_ESP=mode==='brevo'?'brevo':'';try{return emailBuild(doc)}finally{EM_TRACK=null;EM_ESP=''}}
function emailBuild(doc){
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${emE(doc.subject||doc.name||'')}</title><style>body{margin:0;padding:0;background:${EMC.paper}}img{-ms-interpolation-mode:bicubic}a{color:${EMC.brand}}@media (max-width:620px){.em-wrap{width:100%!important}.em-col{display:block!important;width:100%!important;max-width:100%!important}.em-col img{max-width:100%!important}.em-gap{display:none!important}td.em-col{padding-bottom:22px!important}.em-h1{font-size:34px!important}td[style*="padding:0 40px"]{padding-left:22px!important;padding-right:22px!important}}</style></head>
<body style="margin:0;padding:0;background:${EMC.paper}"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${emE(doc.preheader||'')}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMC.paper}"><tr><td align="center" style="padding:24px 10px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="em-wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:820px;background:#ffffff">
${doc.blocks.map((b,k)=>emBlock(k,b)).join('\n')}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>${EM_TRACK?`<img src="${emE(emSiteBase()+'newsletter/o?e='+EM_TRACK+'&s=*|UNIQID|*')}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`:''}</body></html>`}

/* ---------- builder UI ---------- */
async function emLoad(){EM.err='';try{const [a,b]=await Promise.all([api('emails'),api('brevoconfig').catch(()=>null)]);EM.list=a.emails||[];EM.brevo=b}catch(e){EM.err=e.message;EM.list=[]}emPaint()}
function emView(){if(EM.list===null&&!EM.loading){EM.loading=true;setTimeout(emLoad)}setTimeout(()=>emPreview(true));return `<div id="em">${emInner()}</div>`}
function emPaint(){const el=document.getElementById('em');if(!el)return;const ae=document.activeElement,aid=ae&&ae.id,sel=ae&&ae.selectionStart;el.innerHTML=emInner();if(aid){const n=document.getElementById(aid);if(n){n.focus();try{if(sel!=null)n.setSelectionRange(sel,sel)}catch(_){}}}emPreview(true)}
function emInner(){
  if(!EM.doc)return emListView();
  const d=EM.doc;
  return `<div class="cms-bar em-bar"><button class="btn small" type="button" data-em="back">← All emails</button><h1 style="font-size:30px">${emE(d.name||'Untitled')}</h1><span class="em-save mono">${EM.saving}</span>
    <button class="btn small" type="button" data-em="copy">Copy HTML</button><button class="btn small" type="button" data-em="download">Download</button><button class="btn small" type="button" data-em="test">Send me a test</button>${EM.brevo&&EM.brevo.connected&&!emSent(d)?'<button class="btn solid small" type="button" data-em="sendopen">Send…</button>':''}</div>${emSendPanel(d)}
  <div class="em-grid"><div class="em-side">
    <div class="em-card"><div class="field"><label for="emName">Name (only you see this)</label><input id="emName" data-emd="name" value="${emE(d.name)}"></div>
      <div class="field"><label for="emSubj">Subject line</label><input id="emSubj" data-emd="subject" value="${emE(d.subject)}" maxlength="150"></div>
      <div class="field"><label for="emPre">Preview text <span class="hint">shown after the subject in the inbox</span></label><input id="emPre" data-emd="preheader" value="${emE(d.preheader)}" maxlength="200"></div></div>
    <div class="em-blocks">${d.blocks.map((b,i)=>emBlockEditor(b,i)).join('')}</div>
    ${EM.adding?`<div class="em-card em-add"><b>Add a block</b><div class="em-addgrid">${Object.entries(EM_BLOCKS).map(([k,v])=>`<button type="button" data-em-add="${k}"><b>${v.l}</b><span>${v.d}</span></button>`).join('')}</div><button class="linkbtn" type="button" data-em="addcancel">Cancel</button></div>`:`<button class="btn em-addbtn" type="button" data-em="add">+ Add a block</button>`}
  </div><div class="em-prev"><div class="em-prevbar"><span class="mono">Preview</span><div class="em-seg"><button type="button" data-em-view="desktop" aria-pressed="${EM.view==='desktop'}">Desktop</button><button type="button" data-em-view="mobile" aria-pressed="${EM.view==='mobile'}">Phone</button></div></div>
    <div class="em-inbox"><b>${emE(d.subject||'(no subject)')}</b><span>${emE(d.preheader||'')}</span></div>
    <div class="em-stage" id="emStage"><iframe id="emFrame" title="Email preview" class="${EM.view}"></iframe></div></div></div>`}
function emBlockEditor(b,i){
  const open=EM.sel===b.id,info=EM_BLOCKS[b.type]||{l:b.type},n=EM.doc.blocks.length;
  const sum=b.heading||b.label||b.tagline||(b.type==='books'?(b.ids||[]).length+' courses':'')||(b.type==='feature'&&bookById(b.id)?bookById(b.id).title:'')||'';
  return `<div class="em-blk${open?' open':''}" data-bid="${b.id}"><div class="em-blkhead"><button type="button" class="em-blkname" data-em-sel="${b.id}" aria-expanded="${open}"><b>${info.l}</b><span>${emE(sum)}</span></button>
    <span class="em-tools"><button type="button" data-em-mv="${b.id}:-1" ${i?'':'disabled'} aria-label="Move up">↑</button><button type="button" data-em-mv="${b.id}:1" ${i<n-1?'':'disabled'} aria-label="Move down">↓</button><button type="button" data-em-dup="${b.id}" aria-label="Duplicate">⧉</button><button type="button" data-em-del="${b.id}" aria-label="Remove">✕</button></span></div>
    ${open?`<div class="em-fields">${b.type==='offer'?'<p class="hint" style="margin:10px 0 0">Make sure the same code is set up as a discount at checkout before you send, so it works.</p>':''}${(EM_FIELDS[b.type]||[]).map(f=>emField(b,f)).join('')||'<p class="hint">Nothing to set for this block.</p>'}</div>`:''}</div>`}
function emField(b,[k,t,l,opts]){
  const id='emf-'+b.id+'-'+k,v=b[k]??'';
  if(t==='text')return `<div class="field"><label for="${id}">${l}</label><input id="${id}" data-emb="${b.id}" data-k="${k}" value="${emE(v)}"></div>`;
  if(t==='area')return `<div class="field"><label for="${id}">${l}</label><textarea id="${id}" rows="4" data-emb="${b.id}" data-k="${k}">${emE(v)}</textarea></div>`;
  if(t==='select')return `<div class="field"><label for="${id}">${l}</label><select id="${id}" data-emb="${b.id}" data-k="${k}">${opts.map(([ov,ol])=>`<option value="${ov}"${String(v)===ov?' selected':''}>${ol}</option>`).join('')}</select></div>`;
  if(t==='image')return `<div class="field"><label for="${id}">${l}</label><div class="em-img">${v?`<img src="${emE(emAbs(v))}" alt="">`:''}<input id="${id}" data-emb="${b.id}" data-k="${k}" value="${emE(v)}" placeholder="Paste an image address, or upload"><label class="btn small">Upload<input type="file" accept="image/jpeg,image/png,image/webp" data-em-up="${b.id}:${k}" hidden></label></div></div>`;
  if(t==='book')return `<div class="field"><label for="${id}">${l}</label><select id="${id}" data-emb="${b.id}" data-k="${k}"><option value="">Choose a course or workshop…</option>${sorted().map(x=>`<option value="${emE(x.id)}"${x.id===v?' selected':''}>${emE(x.title)} (${emE(stLabel(x))})</option>`).join('')}</select></div>`;
  if(t==='books'){const ids=b.ids||[];
    return `<div class="field"><span class="em-lbl">${l} (${ids.length})</span><div class="em-quick">Fill with: <button class="linkbtn" type="button" data-em-fill="${b.id}:space">Space available</button> · <button class="linkbtn" type="button" data-em-fill="${b.id}:next">Next year</button> · <button class="linkbtn" type="button" data-em-fill="${b.id}:workshop">Workshops</button> · <button class="linkbtn" type="button" data-em-fill="${b.id}:clear">Clear</button></div>
      <ol class="em-booklist">${ids.map((x,j)=>{const bk=bookById(x);return bk?`<li>${bk.cover?`<img src="${emE(bk.cover)}" alt="">`:'<i class="em-noimg"></i>'}<span>${emE(bk.title)}</span><button type="button" data-em-bmv="${b.id}:${j}:-1" ${j?'':'disabled'} aria-label="Move up">↑</button><button type="button" data-em-bmv="${b.id}:${j}:1" ${j<ids.length-1?'':'disabled'} aria-label="Move down">↓</button><button type="button" data-em-brm="${b.id}:${j}" aria-label="Remove">✕</button></li>`:''}).join('')}</ol>
      <select data-em-badd="${b.id}" aria-label="Add a course"><option value="">+ Add a course or workshop…</option>${sorted().filter(x=>!ids.includes(x.id)).map(x=>`<option value="${emE(x.id)}">${emE(x.title)} (${emE(stLabel(x))})</option>`).join('')}</select></div>`}
  return ''}
function emListView(){
  const L=EM.list;
  const tpl=`<div class="em-tpls">${Object.entries(EM_TEMPLATES).map(([k,v])=>`<button type="button" class="em-tpl" data-em-new="${k}"><span class="em-tplmark em-${k}"></span><b>${v.l}</b><span>${v.d}</span></button>`).join('')}</div>`;
  let list;
  if(EM.err)list=`<div class="empty"><b>Couldn’t load saved emails.</b>${emE(EM.err)}</div>`;
  else if(!L)list='<p class="hint"><span class="spin"></span>Loading…</p>';
  else if(!L.length)list='<div class="empty"><b>No emails yet.</b>Start from one of the templates above.</div>';
  else list=`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Last changed</th><th></th></tr></thead><tbody>${L.map(m=>`<tr data-em-open="${emE(m.id)}" tabindex="0"><td class="t-title">${emE(m.name||'Untitled')}</td><td>${emE(m.subject||'')}</td><td>${emStatusPill(m)}</td><td class="mono">${emE(fmtStamp(m.updated))}</td><td style="white-space:nowrap;text-align:right"><button class="linkbtn" type="button" data-em-copyid="${emE(m.id)}">Duplicate</button> &nbsp; ${EM.confirmDel===m.id?`<button class="linkbtn" style="color:#A33A12" type="button" data-em-delid="${emE(m.id)}">Delete for good?</button>`:`<button class="linkbtn" type="button" data-em-askdel="${emE(m.id)}">Delete</button>`}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="cms-bar"><h1>Newsletter</h1></div><p class="hint" style="max-width:720px;margin:-8px 0 18px">Build a newsletter from blocks, preview it, send yourself a test, then send it to your subscribers through Brevo. Courses, teachers, prices and links come straight from the course list.</p>
    ${emSendingCard()}<h2 class="em-h">Start a new email</h2>${tpl}<h2 class="em-h">Saved emails</h2>${list}`}
function emFit(){const st=document.getElementById('emStage'),f=document.getElementById('emFrame');if(!st||!f)return;
  // desktop is shown at a real 1100px-wide inbox and scaled to fit, so wide-screen layout is what you see; phone at 375px
  const W=EM.view==='mobile'?375:1100,avail=st.clientWidth,h=st.clientHeight,k=Math.min(1,avail/W);
  f.style.width=W+'px';f.style.height=(h/k)+'px';f.style.transform=`scale(${k})`;f.style.left=Math.max(0,(avail-W*k)/2)+'px'}
window.addEventListener('resize',()=>{if(EM.doc)emFit()});
function emPreview(now){clearTimeout(EM.pt);const go=()=>{const f=document.getElementById('emFrame');if(f&&EM.doc){f.srcdoc=emailHTML(EM.doc);emFit()}};if(now)go();else EM.pt=setTimeout(go,250)}
function emChanged(paint){EM.dirty=true;EM.saving='Saving…';const s=document.querySelector('#em .em-save');if(s)s.textContent=EM.saving;if(paint)emPaint();else emPreview();clearTimeout(EM.t);EM.t=setTimeout(emSave,1200)}
async function emSave(){if(!EM.doc)return;const d=EM.doc;try{const r=await api('emailsave',{email:d});d.id=r.id;d.updated=r.updated;EM.dirty=false;EM.saving='Saved';const i=(EM.list||[]).findIndex(x=>x.id===d.id);const row={id:d.id,name:d.name,subject:d.subject,updated:d.updated};if(EM.list){if(i<0)EM.list.unshift(row);else EM.list[i]=row}}catch(e){EM.saving='Not saved: '+e.message}const s=document.querySelector('#em .em-save');if(s)s.textContent=EM.saving}
function emOpen(doc){doc.blocks=(doc.blocks||[]).map(b=>Object.assign({id:emUid()},b));EM.doc=doc;EM.sel=null;EM.adding=false;EM.saving=doc.id?'Saved':'';emPaint();window.scrollTo(0,0)}
const emFind=id=>EM.doc.blocks.find(b=>b.id===id);
const EM_DEFAULTS={header:{tagline:EM_TAG},hero:{eyebrow:'',heading:'Headline',text:'',bg:'brand'},text:{heading:'',body:''},books:{heading:'Courses',intro:'',ids:[],cols:'3',price:'yes'},feature:{label:'',id:'',blurb:'',button:'Find out more'},offer:{heading:'10% off',text:'',code:'',expires:'',button:'Book now',url:'/courses',terms:''},button:{label:'See all courses',url:'/courses'},image:{src:'',alt:'',href:''},divider:{},footer:EM_FOOT()};
app.addEventListener('click',async e=>{
  if(!e.target.closest('#em'))return;
  const t=e.target.closest('[data-em],[data-em-new],[data-em-open],[data-em-copyid],[data-em-askdel],[data-em-delid],[data-em-sel],[data-em-mv],[data-em-dup],[data-em-del],[data-em-add],[data-em-view],[data-em-fill],[data-em-bmv],[data-em-brm]');if(!t)return;
  const D=t.dataset;
  if(D.emNew){const m=EM_TEMPLATES[D.emNew].make();m.template=D.emNew;emOpen(m);emChanged(false);return}
  if(D.emCopyid){e.stopPropagation();try{const r=await api('emailget',{id:D.emCopyid});const m=r.email;delete m.id;m.name=(m.name||'Email')+' (copy)';emOpen(m);emChanged(false)}catch(err){toast(err.message)}return}
  if(D.emAskdel){e.stopPropagation();EM.confirmDel=D.emAskdel;emPaint();return}
  if(D.emDelid){e.stopPropagation();try{await api('emaildelete',{id:D.emDelid});EM.list=EM.list.filter(x=>x.id!==D.emDelid);EM.confirmDel=null;toast('Email deleted');emPaint()}catch(err){toast(err.message)}return}
  if(D.emOpen){try{const r=await api('emailget',{id:D.emOpen});emOpen(r.email)}catch(err){toast(err.message)}return}
  if(D.em==='back'){clearTimeout(EM.t);if(EM.dirty)await emSave();EM.doc=null;EM.confirmDel=null;emPaint();return}
  if(D.em==='add'){EM.adding=true;emPaint();return}
  if(D.em==='addcancel'){EM.adding=false;emPaint();return}
  if(D.emAdd){const b=Object.assign({id:emUid(),type:D.emAdd},JSON.parse(JSON.stringify(EM_DEFAULTS[D.emAdd]||{})));const bl=EM.doc.blocks;const fi=bl.findIndex(x=>x.type==='footer');bl.splice(fi<0||D.emAdd==='footer'?bl.length:fi,0,b);EM.sel=b.id;EM.adding=false;emChanged(true);return}
  if(D.emSel){EM.sel=EM.sel===D.emSel?null:D.emSel;emPaint();return}
  if(D.emMv){const [id,dir]=D.emMv.split(':');const bl=EM.doc.blocks,i=bl.findIndex(x=>x.id===id),j=i+ +dir;if(j<0||j>=bl.length)return;[bl[i],bl[j]]=[bl[j],bl[i]];emChanged(true);return}
  if(D.emDup){const bl=EM.doc.blocks,i=bl.findIndex(x=>x.id===D.emDup);const c=JSON.parse(JSON.stringify(bl[i]));c.id=emUid();bl.splice(i+1,0,c);EM.sel=c.id;emChanged(true);return}
  if(D.emDel){EM.doc.blocks=EM.doc.blocks.filter(x=>x.id!==D.emDel);emChanged(true);return}
  if(D.emView){EM.view=D.emView;emPaint();return}
  if(D.emFill){const [id,k]=D.emFill.split(':');const b=emFind(id);b.ids=k==='clear'?[]:emPick(k,12);emChanged(true);return}
  if(D.emBmv){const [id,j,dir]=D.emBmv.split(':');const a=emFind(id).ids,x=+j,y=x+ +dir;[a[x],a[y]]=[a[y],a[x]];emChanged(true);return}
  if(D.emBrm){const [id,j]=D.emBrm.split(':');emFind(id).ids.splice(+j,1);emChanged(true);return}
  if(!EM.doc||!['copy','download','test'].includes(D.em))return;
  if((D.em==='copy'||D.em==='download')&&!EM.doc.id){clearTimeout(EM.t);await emSave()}
  const html=emailHTML(EM.doc,D.em!=='test');
  if(D.em==='copy'){try{await navigator.clipboard.writeText(html);toast('Email HTML copied. Paste it into your mailing service as a custom HTML email.')}catch(_){toast('Copy didn’t work in this browser. Use Download instead.')}return}
  if(D.em==='download'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download=(EM.doc.name||'email').replace(/[^\w-]+/g,'-').toLowerCase()+'.html';document.body.appendChild(a);a.click();a.remove();return}
  if(D.em==='test'){t.disabled=true;t.textContent='Sending…';try{const r=await api('emailtest',{subject:EM.doc.subject||EM.doc.name,html});toast('Test sent to '+r.to+'. It can take a minute to arrive.')}catch(err){toast(err.message)}t.disabled=false;t.textContent='Send me a test';return}
});
app.addEventListener('input',e=>{
  const t=e.target;if(!t.closest('#em')||!EM.doc)return;
  if(t.dataset.emd){EM.doc[t.dataset.emd]=t.value;if(t.dataset.emd!=='name'){const ib=document.querySelector('#em .em-inbox');if(ib)ib.innerHTML=`<b>${emE(EM.doc.subject||'(no subject)')}</b><span>${emE(EM.doc.preheader||'')}</span>`}emChanged(false);return}
  if(t.dataset.emb&&t.tagName!=='SELECT'){const b=emFind(t.dataset.emb);if(b){b[t.dataset.k]=t.value;emChanged(false)}}
});
app.addEventListener('change',async e=>{
  const t=e.target;if(!t.closest('#em')||!EM.doc)return;
  if(t.dataset.emb&&t.tagName==='SELECT'){const b=emFind(t.dataset.emb);if(b){b[t.dataset.k]=t.value;emChanged(true)}return}
  if(t.dataset.emb&&t.dataset.k&&t.closest('.em-img')){emPaint();return}
  if(t.dataset.emBadd&&t.value){const b=emFind(t.dataset.emBadd);(b.ids=b.ids||[]).push(t.value);emChanged(true);return}
  if(t.dataset.emUp&&t.files&&t.files[0]){const [id,k]=t.dataset.emUp.split(':');try{toast('Uploading…');const r=await uploadFile(t.files[0]);emFind(id)[k]=r.path;emChanged(true)}catch(err){toast(err.message)}}
});

/* ---------- Newsletter: footer sign-up + CMS subscribers list ---------- */
const SUB={list:null,err:'',q:'',f:'subscribed',confirm:null,adding:false};
async function subLoad(){SUB.err='';try{const [a,b]=await Promise.all([api('subscribers'),api('brevoconfig').catch(()=>null)]);SUB.list=a.subscribers||[];SUB.brevo=b}catch(e){SUB.err=e.message;SUB.list=[]}subPaint()}
function subView(){if(SUB.list===null&&!SUB.loading){SUB.loading=true;setTimeout(subLoad)}return `<div id="subs">${subInner()}</div>`}
function subPaint(){const el=document.getElementById('subs');if(el)el.innerHTML=subInner()}
const SUB_ST={subscribed:'Subscribed',pending:'Waiting to confirm',unsubscribed:'Unsubscribed'};
function subInner(){
  const L=SUB.list;
  const head=`<div class="cms-bar"><h1>Subscribers</h1><input id="subQ" type="search" placeholder="Search email or name" value="${esc(SUB.q)}" aria-label="Search subscribers">${SUB.brevo&&SUB.brevo.connected?`<button class="btn small" type="button" data-sub="sync" title="${SUB.brevo.lastSync?'Last synced '+esc(fmtStamp(SUB.brevo.lastSync)):'Not synced yet'}">Sync with Brevo</button>`:''}<button class="btn small" type="button" data-sub="csv"${L&&L.some(x=>x.status==='subscribed')?'':' disabled'}>Export list</button><button class="btn solid small" type="button" data-sub="add">Add someone</button></div>
  <p class="hint" style="max-width:760px;margin:-8px 0 16px">People who signed up with the form at the bottom of the website (they count as subscribed once they click the link in the confirmation email), and families who agreed to news and offers in their account or at checkout. Newsletters go to everyone subscribed through Brevo, or export the list for another mailing service.</p>`;
  if(SUB.err)return head+`<div class="empty"><b>Couldn’t load subscribers.</b>${esc(SUB.err)}</div>`;
  if(!L)return head+'<p class="hint"><span class="spin"></span>Loading…</p>';
  const add=SUB.adding?`<form class="form" id="subAdd" novalidate style="max-width:760px;margin-bottom:18px;grid-template-columns:1fr 1fr">
    <div class="field half"><label for="saE">Email</label><input type="email" id="saE" required autocomplete="off"></div>
    <div class="field half"><label for="saN">Name (optional)</label><input type="text" id="saN" maxlength="80" autocomplete="off"></div>
    <div class="field"><label class="check"><input type="checkbox" id="saOk"> This person has agreed to receive the OH-SO ED newsletter</label></div>
    <div class="field" style="display:flex;gap:10px;align-items:center"><button class="btn solid small" type="submit">Add subscriber</button><button class="linkbtn" type="button" data-sub="addcancel">Cancel</button><span class="hint" id="saMsg" role="alert"></span></div></form>`:'';
  const q=SUB.q.toLowerCase();
  const inQ=L.filter(x=>!q||(x.email+' '+(x.name||'')).toLowerCase().includes(q));
  const n=k=>inQ.filter(x=>k==='all'||x.status===k).length;
  const chips=`<div class="cms-filters" role="group" aria-label="Filter subscribers">${['subscribed','pending','unsubscribed','all'].map(k=>`<button type="button" class="cms-chip" data-subf="${k}" aria-pressed="${SUB.f===k}">${k==='all'?'All':SUB_ST[k]} <span>${n(k)}</span></button>`).join('')}</div>`;
  const rows=inQ.filter(x=>SUB.f==='all'||x.status===SUB.f).sort((a,b)=>String(b.confirmed||b.created||'').localeCompare(String(a.confirmed||a.created||'')));
  const tbl=rows.length?`<div class="tbl-wrap"><table class="tbl subs"><thead><tr><th>Email</th><th>Name</th><th>Status</th><th>Signed up</th><th>From</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.email)}</b></td><td>${esc(x.name||'')}</td><td><span class="pill sub-${esc(x.status)}">${SUB_ST[x.status]||esc(x.status)}</span></td><td class="mono">${esc(fmtDate((x.confirmed||x.created||'').slice(0,10),true))}</td><td class="muted" style="font-size:13px">${esc(x.source||'')}</td><td style="white-space:nowrap;text-align:right">${x.status==='unsubscribed'?'':`<button class="linkbtn" type="button" data-subdo="unsubscribe" data-e="${esc(x.email)}">Unsubscribe</button> &nbsp; `}${SUB.confirm===x.email?`<button class="linkbtn" style="color:#A33A12" type="button" data-subdo="delete" data-e="${esc(x.email)}">Remove for good?</button>`:`<button class="linkbtn" type="button" data-subask="${esc(x.email)}">Remove</button>`}</td></tr>`).join('')}</tbody></table></div>`
    :`<div class="empty"><b>${L.length?'Nobody here.':'No subscribers yet.'}</b>${L.length?'Try another filter.':'Sign-ups from the website footer will appear here.'}</div>`;
  return head+add+chips+tbl}
function subCSV(){
  const rows=SUB.list.filter(x=>x.status==='subscribed');
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const csv=['Email Address,First Name,Signed Up,Source',...rows.map(x=>[x.email,x.name||'',(x.confirmed||x.created||'').slice(0,10),x.source||''].map(q).join(','))].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download='ohsoed-subscribers-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove()}
app.addEventListener('click',async e=>{
  if(!e.target.closest('#subs'))return;
  const t=e.target.closest('[data-sub],[data-subf],[data-subask],[data-subdo]');if(!t)return;const D=t.dataset;
  if(D.sub==='add'){SUB.adding=true;subPaint();const i=document.getElementById('saE');if(i)i.focus();return}
  if(D.sub==='addcancel'){SUB.adding=false;subPaint();return}
  if(D.sub==='csv'){subCSV();return}
  if(D.sub==='sync'){t.disabled=true;t.textContent='Syncing…';try{const r=await api('brevosync',{});toast(`Synced: ${r.pushed} subscriber${r.pushed===1?'':'s'} in Brevo${r.unsubscribed?`, ${r.unsubscribed} unsubscribed there`:''}`);await subLoad()}catch(err){toast(err.message);t.disabled=false;t.textContent='Sync with Brevo'}return}
  if(D.subf){SUB.f=D.subf;subPaint();return}
  if(D.subask){SUB.confirm=D.subask;subPaint();return}
  if(D.subdo){t.disabled=true;try{await api('subscriberset',{email:D.e,do:D.subdo});SUB.confirm=null;toast(D.subdo==='delete'?'Removed':'Unsubscribed');await subLoad()}catch(err){toast(err.message);t.disabled=false}return}
});
app.addEventListener('submit',async e=>{
  if(e.target.id!=='subAdd')return;e.preventDefault();
  const m=document.getElementById('saMsg'),email=document.getElementById('saE').value.trim(),name=document.getElementById('saN').value.trim();
  if(!document.getElementById('saOk').checked){m.textContent='Only add people who have agreed to receive it.';return}
  try{await api('subscriberadd',{email,name});SUB.adding=false;toast(email+' added');await subLoad()}catch(err){m.textContent=err.message}
});
app.addEventListener('input',e=>{if(e.target.id!=='subQ')return;SUB.q=e.target.value;const el=document.getElementById('subs');if(!el)return;const pos=e.target.selectionStart;subPaint();const i=document.getElementById('subQ');if(i){i.focus();try{i.setSelectionRange(pos,pos)}catch(_){}}});



/* ---------- Brevo: connect, send, schedule ---------- */
const emSent=d=>!!(d&&d.brevo&&['sent','sending','scheduled'].includes(d.brevo.status));
function emStatusPill(m){const b=m.brevo;if(!b)return '<span class="pill">Draft</span>';
  if(b.status==='scheduled')return `<span class="pill sub-pending">Scheduled ${emE(fmtStamp(b.at))}</span>`;
  if(b.status==='cancelled')return '<span class="pill">Cancelled</span>';
  return `<span class="pill sub-subscribed">Sent ${emE(fmtStamp(b.at))}</span>`}
function emSendingCard(){
  const b=EM.brevo;if(!b)return '';
  if(EM.brevoEdit&&b.canEdit){const sn=EM.senders;
    return `<form class="em-card em-brevo" id="brevoForm" novalidate style="max-width:760px;margin-bottom:8px"><b>Sending with Brevo</b>
      <div class="field"><label for="bvKey">API key ${b.hasKey?`<span class="hint">saved (${emE(b.keyHint)}). Leave empty to keep it, or paste a new one to switch account.</span>`:''}</label><input id="bvKey" name="brevo-api-key" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="xkeysib-…"></div>
      ${b.hasKey?`<div class="field"><label for="bvSender">Send from</label>${sn===undefined?'<p class="hint"><span class="spin"></span>Loading senders…</p>':sn&&sn.length?`<select id="bvSender">${sn.map(x=>`<option value="${emE(x.email)}" data-name="${emE(x.name)}"${x.email===b.senderEmail?' selected':''}${x.active?'':' disabled'}>${emE(x.name)} &lt;${emE(x.email)}&gt;${x.active?'':' (not verified yet)'}</option>`).join('')}</select>`:'<p class="hint">No senders in this Brevo account yet. Add and verify one in Brevo under Senders, then come back.</p>'}</div>
      <div class="field"><label for="bvName">Sender name</label><input id="bvName" value="${emE(b.senderName||'OH-SO ED')}" maxlength="60"></div>
      <div class="field"><label for="bvReply">Reply-to <span class="hint">(optional: replies go here instead of the sender, e.g. leanne@ohsoed.co.uk)</span></label><input id="bvReply" type="email" value="${emE(b.replyTo||'')}" placeholder="leanne@ohsoed.co.uk" maxlength="120"></div>`:''}
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn solid small" type="submit">${b.hasKey?'Save':'Connect'}</button><button class="linkbtn" type="button" data-em="brevocancel">Cancel</button>${b.hasKey?'<button class="linkbtn" type="button" data-em="brevooff" style="margin-left:auto">Disconnect Brevo</button>':''}<span class="hint" id="bvMsg" role="alert"></span></div></form>`}
  if(b.connected)return `<div class="em-card em-brevo on" style="max-width:760px;margin-bottom:8px"><div><b>Sending with Brevo</b> <span class="pill sub-subscribed">Connected</span></div><p class="hint" style="margin:0">From <b>${emE(b.senderName)} &lt;${emE(b.senderEmail)}&gt;</b>${b.replyTo?`, replies to <b>${emE(b.replyTo)}</b>,`:''} to the list “${emE(b.listName)}”${b.account?` · account ${emE(b.account)}`:''}.</p>${b.canEdit?'<button class="linkbtn" type="button" data-em="brevoedit" style="justify-self:start">Change account or sender</button>':''}</div>`;
  return `<div class="em-card em-brevo" style="max-width:760px;margin-bottom:8px"><b>Sending with Brevo</b><p class="hint" style="margin:0">${b.hasKey?'Almost there: choose the sender address.':'Connect your Brevo account to send emails to your subscribers straight from here.'}</p>${b.canEdit?`<button class="btn solid small" type="button" data-em="brevoedit" style="justify-self:start">${b.hasKey?'Choose sender':'Connect Brevo'}</button>`:'<p class="hint" style="margin:0">Ask an admin to connect it.</p>'}</div>`}
function emSendPanel(d){
  const st=d.brevo;
  if(st&&st.status==='scheduled')return `<div class="em-sent"><b>Scheduled</b> to go to your subscribers on ${emE(fmtStamp(st.at))}. <button class="linkbtn" type="button" data-em="unschedule">Cancel the send</button></div>`;
  if(st&&(st.status==='sent'||st.status==='sending'))return `<div class="em-sent"><b>Sent</b> to your subscribers on ${emE(fmtStamp(st.at))} through Brevo. Changes here won’t reach anyone; duplicate the email to send a new version. Results are under <a class="linkbtn" href="/admin/email-stats">Email stats</a>.</div>`;
  if(!EM.sending)return '';
  const n=EM.subCount;
  return `<form class="em-card em-sendp" id="emSendForm" novalidate><b>Send “${emE(d.subject||'(no subject)')}”</b>
    <p class="hint" style="margin:0">To <b>${n==null?'…':n} confirmed subscriber${n===1?'':'s'}</b> on “${emE(EM.brevo.listName)}”, from ${emE(EM.brevo.senderName)} &lt;${emE(EM.brevo.senderEmail)}&gt;.</p>
    <div class="em-when"><label class="check"><input type="radio" name="when" value="now" checked> Send now</label><label class="check"><input type="radio" name="when" value="later"> Schedule for</label><input type="datetime-local" id="emAt" aria-label="Send date and time"></div>
    <label class="check"><input type="checkbox" id="emSure"> I’ve sent myself a test and checked it</label>
    <div style="display:flex;gap:10px;align-items:center"><button class="btn solid small" type="submit">Send to subscribers</button><button class="linkbtn" type="button" data-em="sendclose">Cancel</button><span class="hint" id="emSendMsg" role="alert"></span></div></form>`}
async function emBrevoSenders(){try{EM.senders=(await api('brevosenders')).senders}catch(e){EM.senders=[];toast(e.message)}emPaint()}
app.addEventListener('click',async e=>{
  if(!e.target.closest('#em'))return;const t=e.target.closest('[data-em]');if(!t)return;const a=t.dataset.em;
  if(a==='brevoedit'){EM.brevoEdit=true;EM.senders=undefined;emPaint();if(EM.brevo.hasKey)emBrevoSenders();return}
  if(a==='brevocancel'){EM.brevoEdit=false;emPaint();return}
  if(a==='brevooff'){if(t.dataset.sure!=='1'){t.dataset.sure='1';t.textContent='Disconnect for good?';return}try{await api('brevoconfig',{disconnect:true});EM.brevo=await api('brevoconfig');EM.brevoEdit=false;toast('Brevo disconnected');emPaint()}catch(err){toast(err.message)}return}
  if(a==='sendopen'){if(!EM.doc.subject){toast('Add a subject line first.');return}clearTimeout(EM.t);if(EM.dirty||!EM.doc.id)await emSave();EM.sending=true;EM.subCount=null;emPaint();try{const r=await api('subscribers');EM.subCount=(r.subscribers||[]).filter(x=>x.status==='subscribed').length}catch(_){}emPaint();return}
  if(a==='sendclose'){EM.sending=false;emPaint();return}
  if(a==='unschedule'){try{await api('emailcancel',{id:EM.doc.id});EM.doc.brevo.status='cancelled';delete EM.doc.brevo;toast('Send cancelled. It’s a draft again.');emPaint()}catch(err){toast(err.message)}return}
});
app.addEventListener('submit',async e=>{
  if(e.target.id==='brevoForm'){e.preventDefault();const m=document.getElementById('bvMsg'),key=document.getElementById('bvKey').value.trim(),sel=document.getElementById('bvSender'),nm=document.getElementById('bvName');
    const body={};if(key)body.key=key;if(sel){body.senderEmail=sel.value;body.senderName=nm?nm.value:(sel.selectedOptions[0]||{}).dataset.name;const rp=document.getElementById('bvReply');if(rp)body.replyTo=rp.value.trim()}
    m.textContent='Checking with Brevo…';try{await api('brevoconfig',body);EM.brevo=await api('brevoconfig');if(key){EM.senders=undefined;emPaint();emBrevoSenders();toast('Brevo connected. Now choose the sender.')}else{EM.brevoEdit=!EM.brevo.connected;toast('Saved');emPaint()}}catch(err){m.textContent=err.message}return}
  if(e.target.id==='emSendForm'){e.preventDefault();const m=document.getElementById('emSendMsg');
    if(!document.getElementById('emSure').checked){m.textContent='Please send yourself a test and check it first.';return}
    const later=e.target.querySelector('input[name=when]:checked').value==='later';let when='now';
    if(later){const v=document.getElementById('emAt').value;if(!v){m.textContent='Choose the date and time.';return}when=new Date(v).toISOString()}
    const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;m.textContent=later?'Scheduling…':'Sending…';
    try{clearTimeout(EM.t);if(EM.dirty)await emSave();const r=await api('emailsend',{id:EM.doc.id,html:emailHTML(EM.doc,'brevo'),when});EM.doc.brevo=r.brevo;EM.sending=false;
      const i=(EM.list||[]).findIndex(x=>x.id===EM.doc.id);if(i>=0)EM.list[i].brevo=r.brevo;toast(later?'Scheduled':'Sending to your subscribers now');emPaint()}
    catch(err){m.textContent=err.message;btn.disabled=false}}
});
/* ---------- Email stats: opens, clicks and list growth ---------- */
const EST={data:null,subs:null,err:'',open:null,days:90};
async function estLoad(){EST.err='';try{const [a,b]=await Promise.all([api('emailstats'),api('subscribers')]);EST.data=a;EST.subs=b.subscribers||[]}catch(e){EST.err=e.message}estPaint()}
function estView(){if(EST.data===null&&!EST.loading){EST.loading=true;setTimeout(estLoad)}return `<div id="est">${estInner()}</div>`}
function estPaint(){const el=document.getElementById('est');if(el)el.innerHTML=estInner()}
const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
function estBars(rows,max){return `<div class="est-bars">${rows.map(([k,v,lab])=>`<div class="est-bar" title="${esc(lab||k)}: ${v}"><i style="height:${max?Math.max(v?4:0,Math.round(v/max*100)):0}%"></i><span>${esc(k)}</span></div>`).join('')}</div>`}
function estInner(){
  const head=`<div class="cms-bar"><h1>Email stats</h1><button class="btn small" type="button" data-est="reload">Refresh</button></div>`;
  if(EST.err)return head+`<div class="empty"><b>Couldn’t load the stats.</b>${esc(EST.err)}</div>`;
  if(!EST.data)return head+'<p class="hint"><span class="spin"></span>Loading…</p>';
  const S=EST.subs,now=Date.now(),d30=now-30*864e5,ts=x=>Date.parse(x||'')||0;
  const subd=S.filter(x=>x.status==='subscribed');
  const cards=[[subd.length,'Subscribed'],[S.filter(x=>x.status==='subscribed'&&ts(x.confirmed||x.created)>d30).length,'New in the last 30 days'],[S.filter(x=>x.status==='pending').length,'Waiting to confirm'],[S.filter(x=>x.status==='unsubscribed'&&ts(x.left)>d30).length,'Unsubscribed in the last 30 days']];
  const months=[];for(let i=11;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);months.push([d.getFullYear(),d.getMonth()])}
  const mrows=months.map(([y,m])=>{const n=S.filter(x=>{const t=new Date(ts(x.confirmed||x.created));return x.status!=='pending'&&t.getFullYear()===y&&t.getMonth()===m}).length;return [MONTHS[m].slice(0,3),n,MONTHS[m]+' '+y]});
  const mmax=Math.max(1,...mrows.map(r=>r[1]));
  const C=EST.data.campaigns||[];
  const list=C.length?`<div class="tbl-wrap"><table class="tbl est-tbl"><thead><tr><th>Email</th><th class="n">Opened by</th><th class="n">Opens</th><th class="n">Clicked by</th><th class="n">Clicks</th><th class="n">Click rate</th><th>Last activity</th></tr></thead><tbody>${C.map(c=>{const open=EST.open===c.id;return `<tr data-est-open="${esc(c.id)}" tabindex="0" class="${open?'on':''}"><td class="t-title">${esc(c.name||'(deleted email)')}<div class="muted" style="font-size:12.5px;font-weight:400">${esc(c.subject||'')}</div>${c.brevo?`<div class="est-bv">Brevo: ${c.brevo.delivered} delivered · ${c.brevo.opened} opened (${pct(c.brevo.opened,c.brevo.delivered)}) · ${c.brevo.clicked} clicked (${pct(c.brevo.clicked,c.brevo.delivered)}) · ${c.brevo.unsubscribed} unsubscribed${c.brevo.bounced?` · ${c.brevo.bounced} bounced`:''}</div>`:''}</td><td class="n" title="Includes people who clicked, even if their email didn’t report an open">${c.brevo?c.brevo.opened:c.uopens}</td><td class="n muted">${c.brevo?'—':c.opens}</td><td class="n">${c.brevo?c.brevo.clicked:c.uclicks}</td><td class="n muted">${c.brevo?'—':c.clicks}</td><td class="n">${c.brevo?pct(c.brevo.clicked,c.brevo.opened):pct(c.uclicks,c.uopens)}</td><td class="mono">${esc(fmtStamp(c.last))}</td></tr>${open?`<tr class="est-detail"><td colspan="7">${estDetail(c)}</td></tr>`:''}`}).join('')}</tbody></table></div>`
    :`<div class="empty"><b>No email activity yet.</b>Opens and clicks appear here once you send an email from the Newsletter section.</div>`;
  return head+`<div class="est-figs">${cards.map(([n,l])=>`<div class="est-fig"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    <h2 class="em-h">Sign-ups by month</h2><div class="est-card">${mrows.some(r=>r[1])?estBars(mrows,mmax):'<p class="hint" style="margin:0">No sign-ups yet. They’ll show here month by month once people join from the website footer.</p>'}</div>
    <h2 class="em-h">Emails sent</h2>${list}
    <p class="hint" style="max-width:760px;margin-top:14px">“Opened by” and “Clicked by” count people, not times. Opens are approximate: Apple Mail loads every email automatically, and some inboxes block images, so treat them as a guide. Clicks are the more reliable measure. For emails sent through Brevo, the figures are Brevo’s own and refresh every 10 minutes. Test emails and the preview are never counted.</p>`}
function estDetail(c){
  const links=(c.links||[]).slice(0,15),lmax=Math.max(1,...links.map(l=>l.n));
  // every day from the first activity to today (up to 30 days), so quiet days show as gaps
  const byD={};(c.days||[]).forEach(d=>byD[d.d]=d);const keys=Object.keys(byD).sort();const days=[];
  if(keys.length){const end=new Date();end.setHours(12,0,0,0);let st=new Date(keys[0]+'T12:00:00');const min=new Date(end-29*864e5);if(st<min)st=min;
    for(let d=new Date(st);d<=end;d=new Date(+d+864e5)){const k=d.toISOString().slice(0,10);days.push(byD[k]||{d:k,o:0,c:0})}}
  const dmax=Math.max(1,...days.map(d=>Math.max(d.o,d.c)));
  return `<div class="est-det"><div><h3>Opens and clicks by day</h3>${days.length?`<div class="est-bars days">${days.map(d=>`<div class="est-bar" title="${esc(fmtDate(d.d,true))}: ${d.o} opens, ${d.c} clicks"><i style="height:${Math.round(d.o/dmax*100)}%"></i><i class="c" style="height:${Math.round(d.c/dmax*100)}%"></i><span>${esc(d.d.slice(8,10))}</span></div>`).join('')}</div><p class="est-key"><i></i> Opens <i class="c"></i> Clicks</p>`:'<p class="hint">No activity yet.</p>'}</div>
    <div><h3>Most clicked</h3>${links.length?`<table class="est-links">${links.map(l=>`<tr><td class="barcell"><i style="width:${Math.round(l.n/lmax*100)}%"></i><span>${esc(l.l||'Link')}</span></td><td class="n">${l.u} ${l.u===1?'person':'people'}</td><td class="n muted">${l.n}</td></tr>`).join('')}</table>`:'<p class="hint">No clicks yet.</p>'}</div></div>`}
app.addEventListener('click',e=>{if(!e.target.closest('#est'))return;const t=e.target.closest('[data-est],[data-est-open]');if(!t)return;
  if(t.dataset.est==='reload'){EST.data=null;estPaint();estLoad();return}
  if(t.dataset.estOpen){EST.open=EST.open===t.dataset.estOpen?null:t.dataset.estOpen;estPaint()}});

if(page==='subscribers'){app.innerHTML=subView()}
else if(page==='stats'){app.innerHTML=estView()}
else{app.innerHTML=emView()}
}
