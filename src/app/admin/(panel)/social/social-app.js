// @ts-nocheck
/* Admin → Social, the front end. A port of the Giles CMS social section (D Giles Ltd, Oct 2026): the same plain-JS
   rendering into one element, with helpers for this site. "Books" are our courses and workshops (BOOT.items). */
export function mountSocial(app, BOOT){
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={books:BOOT.items||[]};
const bookById=id=>state.books.find(b=>b.id===id)||null;
const emSiteBase=()=>BOOT.base+'/';
const emAbs=p=>!p?'':/^(https?:|data:|blob:)/.test(p)?p:BOOT.base+p;
function fmtDate(d,long){if(!d)return '';const x=new Date(String(d).length<=10?d+'T12:00:00':d);if(isNaN(x))return '';return x.toLocaleDateString('en-GB',{day:'numeric',month:long?'long':'short',year:'numeric'})}
function fmtStamp(s){if(!s)return '';const x=new Date(s);if(isNaN(x))return '';return x.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
let toastT=0;function toast(m){let t=document.getElementById('soc-toast');if(!t){t=document.createElement('div');t.id='soc-toast';t.className='soc-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');document.body.appendChild(t)}t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),4000)}
async function api(action,body,isForm){
  const opt=body===undefined?{credentials:'same-origin'}:{method:'POST',credentials:'same-origin',body:isForm?body:JSON.stringify(body),headers:isForm?{}:{'content-type':'application/json'}};
  let r;try{r=await fetch('/admin/social-api?action='+action,opt)}catch(_){throw new Error('Couldn’t reach the server. Check the connection and try again.')}
  const j=await r.json().catch(()=>({error:r.status===401?'Sign in to the admin again.':'Unexpected reply ('+r.status+')'}));
  if(!r.ok||j.error)throw new Error(j.error||('Error '+r.status));return j}
/* pictures for posting: made into JPEGs in the browser, then kept on the server for Facebook and Instagram to fetch */
function socBlob(cv,q){return new Promise((ok,no)=>cv.toBlob(b=>b?ok(b):no(new Error('Couldn’t make the picture.')),'image/jpeg',q||.9))}
async function socFileJpeg(f){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(f.type))throw new Error('Choose a JPEG, PNG or WebP picture.');
  if(f.size>20*1024*1024)throw new Error('That picture is over 20MB.');
  const u=URL.createObjectURL(f);try{const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('That picture couldn’t be read.'));i.src=u});
    const s=Math.min(1,2000/Math.max(im.naturalWidth,im.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(im.naturalWidth*s);cv.height=Math.round(im.naturalHeight*s);
    const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(im,0,0,cv.width,cv.height);return await socBlob(cv,.9)}finally{URL.revokeObjectURL(u)}}
/** The picture as Instagram takes it (a JPEG between 4:5 and 1.91:1): on a coloured card (4:5 or square), or as it is, padded only if its shape won't do. */
async function socPrep(src,frame,bg){
  const im=await kitLoadImg(emAbs(src)).catch(()=>{throw new Error('That picture couldn’t be loaded.')});
  const w=im.naturalWidth,h=im.naturalHeight,r=w/Math.max(1,h);
  if(/^\/social-img\//.test(src)&&frame==='none'&&r>=.8&&r<=1.91)return src;
  const cv=document.createElement('canvas'),x=cv.getContext('2d');
  if(frame==='none'&&r>=.8&&r<=1.91){cv.width=Math.min(1440,w);cv.height=Math.round(cv.width/r);x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.drawImage(im,0,0,cv.width,cv.height)}
  else{if(frame==='none'){frame=r<.8?'4:5':'1.91:1';bg=bg||'#FFFFFF'}
    const [cw,ch]=frame==='1:1'?[1080,1080]:frame==='1.91:1'?[1440,754]:[1080,1350];cv.width=cw;cv.height=ch;
    x.fillStyle=/^#[0-9a-f]{6}$/i.test(bg||'')?bg:'#F3F4FA';x.fillRect(0,0,cw,ch);
    const pad=Math.round(Math.min(cw,ch)*.12),s=Math.min((cw-2*pad)/w,(ch-2*pad)/h),nw=Math.round(w*s),nh=Math.round(h*s),px=Math.round((cw-nw)/2),py=Math.round((ch-nh)/2);
    x.save();x.shadowColor='rgba(0,0,0,.25)';x.shadowBlur=Math.round(nw*.06);x.shadowOffsetY=Math.round(nw*.03);x.fillStyle='#fff';x.fillRect(px,py,nw,nh);x.restore();x.drawImage(im,px,py,nw,nh)}
  const fd=new FormData();fd.append('file',await socBlob(cv,.9),'post.jpg');return (await api('upload',fd,true)).path}
/* the Anthropic key for the AI searches, in the Connect to Social pop-up */
function socAiCard(){const a=(SOC.cfg||{}).ai||{};
  return `<form class="em-card so-conn so-ai" id="aiForm" novalidate><b>AI searches (Upcoming moments)</b>
    <p class="hint" style="margin:0">Claude searches the web for timely hooks for posts: birthdays and anniversaries, awareness days and exam dates. It needs an Anthropic API key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Each search uses a little API credit.</p>
    <div class="so-row"><div class="field"><label for="aiKey">API key ${a.hasKey?`<span class="hint">saved (ends ${esc(a.keyEnd)}). Leave empty to keep it.</span>`:''}</label><input id="aiKey" name="anthropic-api-key" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="sk-ant-…"></div></div>
    <details class="so-adv"${a.model?' open':''}><summary>Claude model (optional)</summary><div class="field"><label for="aiModel">Model</label><input id="aiModel" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(a.model||'')}" placeholder="claude-sonnet-5-5"><span class="hint">Leave empty for the default.</span></div></details>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn solid small" type="submit">Save</button>${a.hasKey?'<button class="linkbtn" type="button" data-so-ai="forget" style="margin-left:auto">Remove the key</button>':''}<span class="hint" id="aiMsg" role="alert"></span></div></form>`}
app.addEventListener('submit',async e=>{if(e.target.id!=='aiForm')return;e.preventDefault();const m=document.getElementById('aiMsg');m.textContent='Saving…';
  try{await api('aiconfig',{key:document.getElementById('aiKey').value.trim(),model:document.getElementById('aiModel').value.trim()});SOC.cfg=await api('metaconfig');KIT.ai=!!(SOC.cfg.ai||{}).hasKey;toast('Saved. The AI searches are switched on.');socPaint()}catch(err){m.textContent=err.message}});
app.addEventListener('click',async e=>{const t=e.target.closest&&e.target.closest('[data-so-ai]');if(!t)return;
  if(t.dataset.sure!=='1'){t.dataset.sure='1';t.textContent='Remove for good?';return}
  try{await api('aiconfig',{forget:true});SOC.cfg=await api('metaconfig');KIT.ai=false;toast('Key removed');socPaint()}catch(err){toast(err.message)}});
/* ---------- Social: post to the Facebook Page and Instagram ---------- */
const SOC={cfg:null,posts:null,err:'',setup:false,c:null,confirm:null,busy:false};
const SOC_BG=[['#F3F4FA','Mist'],['#FFFFFF','White'],['#0F1747','Navy'],['#E3CD4B','Mustard']];
async function socLoad(stats){SOC.err='';try{const [a,b,c]=await Promise.all([api('metaconfig'),api('socialposts'+(stats?'&stats=1':'')),api('socialplan').catch(()=>({plan:[]}))]);SOC.cfg=a;SOC.posts=b.posts||[];KIT.plan=c.plan||[];KIT.moments=c.moments||KIT.moments||null;if(KIT.pendingMoment){const s=((KIT.moments||{}).items||[]).find(x=>x.id===KIT.pendingMoment),bk=s&&bookById(s.bookId);KIT.pendingMoment=null;if(bk){KIT.book=bk.id;kbB(bk);kbUse(bk,s)}else{SOC.drawer=true;setTimeout(()=>toast('That moment is no longer on the list'),300)}}KIT.handles=c.handles||{};KIT.ai=!!c.ai;if(c.template&&JSON.stringify(c.template)!==JSON.stringify(KIT.tpl)){KIT.tpl=c.template;KIT.pics={}}}catch(e){SOC.err=e.message;SOC.posts=SOC.posts||[]}SOC.loading=false;socPaint()}
function socView(){if(SOC.posts===null&&!SOC.loading){SOC.loading=true;setTimeout(()=>socLoad(true))}return `<div id="soc">${socInner()}</div>`}
function socPaint(){const el=document.getElementById('soc');if(el)el.innerHTML=socInner()}
function socBoot(){const q=new URLSearchParams(location.search);if(!q.has('social'))return;const what=q.get('social'),mid=q.get('m');history.replaceState(null,'',location.pathname);SOC.posts=null;

  if(what==='moments'){SOC.drawer=!mid;KIT.pendingMoment=mid||null}
  if(what==='compose'){const img=q.get('img')||'',t=(q.get('text')||'').slice(0,2200);SOC.c=socNew({image:/^\/social-img\/[0-9a-f-]{36}\.jpg$/.test(img)?img:'',text:t,igText:t,frame:'none'});setTimeout(()=>window.scrollTo(0,0),50)}
  if(what==='connected')setTimeout(()=>toast('Facebook connected'),400)}
const socNew=(o)=>Object.assign({bookId:'',text:'',igText:'',same:true,link:'',image:'',images:null,frame:'4:5',bg:'#F3F4FA',fb:true,ig:true,when:'now',at:''},o||{});
function socFromBook(b){const lines=[b.title+(b.subtitle?' ('+b.subtitle+')':''),b.summary||'',b.partner?`Taught by ${b.partner}.`:'',b.status==='next'&&b.pubDate?`Starts ${kitMonth(b.pubDate)}.`:b.status==='workshop'&&b.pubDate?`On ${fmtDate(b.pubDate,true)}.`:''].filter(Boolean);
  return {bookId:b.id,text:lines.join('\n\n'),link:kitLink(b,'facebook'),image:b.cover||'',bg:b.tileColor||'#F3F4FA'}}
const socTags=t=>(String(t).match(/(^|\s)#\w/gu)||[]).length;
const socImgSrc=p=>p?emAbs(p):'';

function socConnCard(){
  const c=SOC.cfg;if(!c)return '';
  if((SOC.setup||!c.hasApp)&&c.canEdit){
    return `<form class="em-card so-conn" id="metaForm" novalidate><b>Connect Facebook and Instagram</b>
      <ol class="so-steps">
        <li>Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a> (log in as someone who manages the OH-SO ED Facebook Page) and create an app. Choose <i>Other</i>, then <i>Business</i>.</li>
        <li>Add the product <b>Facebook Login</b>. Under its Settings, paste this into <b>Valid OAuth Redirect URIs</b> and save:<div class="so-copy"><code>${esc(c.redirectUri)}</code><button class="linkbtn" type="button" data-so="copyuri">Copy</button></div></li>
        <li>Make sure the Instagram account is a <b>Business</b> (or Creator) account and is linked to the Facebook Page (Instagram app › Settings › Accounts Centre).</li>
        <li>From <b>App settings › Basic</b>, copy the App ID and App Secret into the boxes below.</li>
      </ol>
      <div class="so-row"><div class="field"><label for="mtId">App ID</label><input id="mtId" name="meta-app-id" inputmode="numeric" autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="e.g. 1234567890123456" value="${esc(c.appId||'')}"></div>
      <div class="field"><label for="mtSec">App Secret ${c.hasApp?'<span class="hint">saved. Leave empty to keep it.</span>':''}</label><input id="mtSec" name="meta-app-secret" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore placeholder="32 letters and numbers"></div></div>
      <details class="so-adv"${c.configId?' open':''}><summary>Using “Facebook Login for Business”?</summary><div class="field"><label for="mtCfg">Configuration ID</label><input id="mtCfg" inputmode="numeric" autocomplete="off" value="${esc(c.configId||'')}"><span class="hint">Only if your app uses Facebook Login for Business: create a configuration with the Page and Instagram permissions and paste its ID here. Otherwise leave it empty.</span></div></details>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn solid small" type="submit">Save and continue</button>${c.hasApp?'<button class="linkbtn" type="button" data-so="setupcancel">Cancel</button><button class="linkbtn" type="button" data-so="forget" style="margin-left:auto">Remove the app</button>':''}<span class="hint" id="mtMsg" role="alert"></span></div></form>`}
  if(!c.hasApp)return `<div class="em-card so-conn"><b>Facebook and Instagram</b><p class="hint" style="margin:0">Not connected yet. Ask an admin to connect the OH-SO ED Page.</p></div>`;
  if(!c.connected)return `<div class="em-card so-conn"><b>Facebook and Instagram</b><p class="hint" style="margin:0">${c.canEdit?'The app is set up. Now log in with Facebook and give it access to the OH-SO ED Page and its Instagram account.':'Not connected yet. Ask an admin to connect the OH-SO ED Page.'}</p>${c.canEdit?`<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><a class="btn solid small so-fbbtn" href="/admin/social-api?action=metalogin">Connect with Facebook</a><button class="linkbtn" type="button" data-so="setup">Change app details</button></div>`:''}</div>`;
  const pages=c.pages||[];
  return `<div class="em-card so-conn on"><div class="so-acct">${c.page.picture?`<img src="${esc(c.page.picture)}" alt="">`:''}<div><b>${esc(c.page.name)}</b> <span class="pill sub-subscribed">Facebook connected</span><br>${c.ig?`<span class="hint">Instagram <b>@${esc(c.ig.username)}</b> <span class="pill sub-subscribed">Connected</span></span>`:'<span class="hint">No Instagram business account is linked to this Page, so only Facebook is available. Link it in Instagram › Accounts Centre, then reconnect.</span>'}</div></div>
    ${c.canEdit?`<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">${pages.length>1?`<label class="hint" style="display:flex;gap:6px;align-items:center">Post as <select id="soPage">${pages.map(p=>`<option value="${esc(p.id)}"${p.id===c.page.id?' selected':''}>${esc(p.name)}${p.ig?' + @'+esc(p.ig):''}</option>`).join('')}</select></label>`:''}<a class="linkbtn" href="/admin/social-api?action=metalogin">Reconnect</a><button class="linkbtn" type="button" data-so="setup">Change app</button><button class="linkbtn" type="button" data-so="disconnect" style="margin-left:auto">Disconnect</button></div>`:''}
    <p class="hint" style="margin:0;font-size:13px">Connected${c.by?' by '+esc(c.by):''}${c.at?' on '+esc(fmtStamp(c.at)):''}.</p></div>`}

function socPrevImg(c,forIg){
  if(!c.image)return '';const src=socImgSrc(c.image);
  if(c.images&&c.images.length>1)return `<div class="so-raw so-car"><img src="${esc(src)}" alt=""><span class="so-carn">1/${c.images.length}</span><div class="so-dots">${c.images.map((_,i)=>`<i${i?'':' class="on"'}></i>`).join('')}</div></div>`;
  if(c.frame==='none')return `<div class="so-raw"><img src="${esc(src)}" alt="" data-so-ratio></div>`;
  return `<div class="so-frame" style="aspect-ratio:${c.frame==='1:1'?'1/1':'4/5'};background:${esc(c.bg)}"><img src="${esc(src)}" alt=""></div>`}
function socPreviews(){
  const c=SOC.c,cfg=SOC.cfg||{},page=cfg.page||{name:'OH-SO ED'},ig=cfg.ig||{username:'ohsoed'};
  const igT=c.same?c.text:c.igText;
  const linkCard=!c.image&&c.link?`<div class="so-link"><span class="mono">${esc((c.link.match(/^https?:\/\/([^/]+)/)||[])[1]||'')}</span><b>${esc(c.bookId?(bookById(c.bookId)||{}).title||'':c.link)}</b></div>`:'';
  const fb=c.fb?`<div class="so-card so-fb"><div class="so-head">${page.picture?`<img src="${esc(page.picture)}" alt="">`:'<i></i>'}<div><b>${esc(page.name)}</b><span>${c.when==='later'&&c.at?esc(fmtStamp(c.at)):'Just now'} · 🌐</span></div></div>
    <div class="so-text">${esc(c.text).replace(/\n/g,'<br>')}${c.image&&c.link&&!c.text.includes(c.link)?`<br><br><span class="so-url">${esc(c.link)}</span>`:''}</div>${socPrevImg(c)}${linkCard}<div class="so-acts"><span>Like</span><span>Comment</span><span>Share</span></div></div>`:'';
  const igc=c.ig&&cfg.ig!==null?`<div class="so-card so-ig"><div class="so-head">${ig.picture?`<img src="${esc(ig.picture)}" alt="">`:'<i></i>'}<div><b>${esc(ig.username)}</b></div></div>${c.image?socPrevImg(c,true):'<div class="so-noimg">Instagram needs a picture</div>'}<div class="so-acts ig"><span>♡</span><span>💬</span><span>➤</span></div><div class="so-text"><b>${esc(ig.username)}</b> ${esc(igT).replace(/\n/g,'<br>')}</div></div>`:'';
  return (fb||igc)?`<div class="so-cards">${fb}${igc}</div>`:'<p class="hint">Choose Facebook or Instagram to see a preview.</p>'}
function socCounts(){const c=SOC.c,t=c.same?c.text:c.igText,n=t.length,h=socTags(t);return c.ig?`Instagram caption: <b class="${n>2200?'so-over':''}">${n.toLocaleString('en-GB')}</b> / 2,200 · hashtags <b class="${h>30?'so-over':''}">${h}</b> / 30`:''}
function socComposer(){
  const c=SOC.c,cfg=SOC.cfg,hasIg=!!cfg.ig,b=c.bookId?bookById(c.bookId):null;
  const books=[...state.books].sort((x,y)=>String(x.title).localeCompare(String(y.title)));
  const grp=(l,f)=>{const L=books.filter(f);return L.length?`<optgroup label="${l}">${L.map(x=>`<option value="${esc(x.id)}"${x.id===c.bookId?' selected':''}>${esc(x.title)}</option>`).join('')}</optgroup>`:''};
  const warn=false?`<p class="so-warn">The website is still password-protected, so Facebook’s link preview will show the password page. Add a picture, or wait until the site is public.</p>`:'';
  return `<form class="so-grid" id="soForm" novalidate><div class="em-card so-side">
    <div class="so-row"><label class="check"><input type="checkbox" id="soFb"${c.fb?' checked':''}> Facebook</label><label class="check"><input type="checkbox" id="soIg"${c.ig&&hasIg?' checked':''}${hasIg?'':' disabled'}> Instagram${hasIg?'':' (not linked)'}</label></div>
    <div class="field"><label for="soBook">Start from a course or workshop <span class="hint">(optional)</span></label><select id="soBook"><option value="">None</option>${grp('Space available',x=>x.status==='space')}${grp('Next year',x=>x.status==='next')}${grp('Workshops',x=>x.status==='workshop')}${grp('Other courses',x=>x.status==='full')}</select></div>
    <div class="field"><label for="soText">${c.ig&&!c.same?'Facebook text':'Text'}</label><textarea id="soText" rows="7">${esc(c.text)}</textarea></div>
    ${c.ig&&hasIg?`<label class="check so-small"><input type="checkbox" id="soSame"${c.same?' checked':''}> Use the same text on Instagram</label>${c.same?'':`<div class="field"><label for="soIgText">Instagram caption</label><textarea id="soIgText" rows="6">${esc(c.igText)}</textarea></div>`}<p class="hint so-count" id="soCount">${socCounts()}</p>`:''}
    <div class="field"><label for="soLink">Link <span class="hint">(Facebook only: links in Instagram captions can’t be clicked)</span></label><input id="soLink" type="url" placeholder="https://" value="${esc(c.link)}"></div>
    ${c.images&&c.images.length>1?`<div class="field"><span class="em-lbl">Carousel: ${c.images.length} pictures</span><div class="so-pics">${c.images.map(p=>`<img src="${esc(socImgSrc(p))}" alt="">`).join('')}</div><button class="linkbtn" type="button" data-so="nocar" style="justify-self:start">Use the first picture only</button></div>`:`<div class="field"><span class="em-lbl">Picture</span>${c.image?`<div class="so-pic"><img src="${esc(socImgSrc(c.image))}" alt=""><button class="linkbtn" type="button" data-so="noimg">Remove</button></div>`:''}
      <div class="so-row">${b&&b.cover&&c.image!==b.cover?'<button class="btn small" type="button" data-so="cover">Use the course picture</button>':''}<label class="btn small so-up">Upload a picture<input type="file" id="soFile" accept="image/jpeg,image/png,image/webp" hidden></label></div></div>`}
    ${c.image&&!(c.images&&c.images.length>1)?`<div class="field"><span class="em-lbl">Shape</span><div class="em-seg">${[['4:5','Card 4:5'],['1:1','Card square'],['none','Picture as it is']].map(([k,l])=>`<button type="button" data-so-frame="${k}" aria-pressed="${c.frame===k}">${l}</button>`).join('')}</div>
      ${c.frame!=='none'?`<div class="so-row so-bgs"><span class="hint">Background</span>${[...(b&&b.tileColor?[[b.tileColor,'Subject colour']]:[]),...SOC_BG].map(([v,l])=>`<button type="button" class="so-sw" data-so-bg="${esc(v)}" title="${esc(l)}" aria-pressed="${c.bg.toLowerCase()===v.toLowerCase()}" style="background:${esc(v)}"></button>`).join('')}<input type="color" id="soBg" value="${esc(c.bg)}" aria-label="Other colour"></div>`:'<p class="hint" style="margin:6px 0 0">Instagram only takes pictures between 4:5 (portrait) and 1.91:1 (landscape). Anything taller or wider gets a plain border added.</p>'}</div>`:''}
    <div class="em-when"><label class="check"><input type="radio" name="soWhen" value="now"${c.when==='now'?' checked':''}> Post now</label><label class="check"><input type="radio" name="soWhen" value="later"${c.when==='later'?' checked':''}> Schedule for</label><input type="datetime-local" id="soAt" value="${esc(c.at)}" aria-label="Post date and time"></div>
    ${warn}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn solid small" type="submit"${SOC.busy?' disabled':''}>${SOC.busy?'Posting…':c.when==='later'?'Schedule':'Post now'}</button><button class="linkbtn" type="button" data-so="close">Cancel</button><span class="hint" id="soMsg" role="alert"></span></div>
  </div><div class="so-prevwrap"><div class="em-prevbar"><span>Preview</span><span>Roughly how it will look</span></div><div id="soPrev">${socPreviews()}</div></div></form>`}
function socChan(p,ch){const x=p.channels&&p.channels[ch];if(!x)return '';const L=ch==='facebook'?'Facebook':'Instagram';
  const s=x.status;let h='';
  if(s==='posted')h=`<span class="pill sub-subscribed">${L}</span> ${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">View</a>`:'Posted'}`;
  else if(s==='scheduled')h=`<span class="pill sub-pending">${L}</span> scheduled`;
  else if(s==='processing')h=`<span class="pill sub-pending">${L}</span> still processing`;
  else if(s==='cancelled')h=`<span class="pill">${L}</span> cancelled`;
  else h=`<span class="pill so-bad">${L}</span> didn’t post<div class="so-err">${esc(x.error||'')}</div>`;
  const st=p.stats&&p.stats[ch];
  if(s==='posted'&&st)h+=`<div class="so-nums">${ch==='facebook'?`${st.reactions} reaction${st.reactions===1?'':'s'} · ${st.comments} comments · ${st.shares} share${st.shares===1?'':'s'}`:`${st.likes} like${st.likes===1?'':'s'} · ${st.comments} comments`}</div>`;
  return `<div class="so-ch">${h}</div>`}
function socInner(){
  const cfg=SOC.cfg;
  const conn=cfg?(cfg.connected?`<button class="btn small so-connbtn on" type="button" data-so="modal" title="Facebook and Instagram settings"><i></i>${esc(cfg.page.name)}${cfg.ig?' + @'+esc(cfg.ig.username):''}</button>`:`<button class="btn solid small so-connbtn" type="button" data-so="modal">Connect to Social</button>`):'';
  const head=`<div class="cms-bar"><h1>Social</h1>${cfg&&cfg.connected&&!SOC.c?'<button class="btn small" type="button" data-so="reload">Refresh numbers</button><button class="btn solid small" type="button" data-so="new">New post</button>':''}${cfg?kbMomBtn():''}${conn}</div>`+(SOC.drawer&&cfg?kbMoments():'')+(SOC.modal&&cfg?`<div class="so-modal" data-so-backdrop><div class="so-dialog" role="dialog" aria-modal="true" aria-label="Connect to Social"><button class="so-x" type="button" data-so="modalclose" aria-label="Close">×</button>${socConnCard()}${socAiCard()}</div></div>`:'');
  if(SOC.err&&!cfg)return head+`<div class="empty"><b>Couldn’t load Social.</b>${esc(SOC.err)}</div>`;
  if(!cfg)return head+'<p class="hint"><span class="spin"></span>Loading…</p>';
  if(SOC.c)return head+socComposer();
  if(KIT.book)return kitBookView();
  const P=[...(SOC.posts||[])].sort((a,b)=>String(b.at||b.created).localeCompare(String(a.at||a.created)));
  const list=P.length?`<div class="tbl-wrap"><table class="tbl so-tbl"><thead><tr><th>Post</th><th>Where</th><th>When</th><th></th></tr></thead><tbody>${P.map(p=>{const sch=Object.values(p.channels||{}).some(x=>x.status==='scheduled'||x.status==='processing');const img=p.igImage||p.image;
    return `<tr><td><div class="so-post">${img?`<img src="${esc(socImgSrc(img))}" alt="">`:'<i></i>'}<span>${esc((p.text||p.link||'').slice(0,160))}${(p.text||'').length>160?'…':''}</span></div></td><td>${socChan(p,'facebook')}${socChan(p,'instagram')}</td><td class="mono" style="white-space:nowrap">${esc(fmtStamp(p.at||p.created))}</td>
    <td style="white-space:nowrap;text-align:right">${sch?`<button class="linkbtn" type="button" data-so-cancel="${esc(p.id)}">Cancel</button> &nbsp; `:''}<button class="linkbtn" type="button" data-so-again="${esc(p.id)}">Post again</button> &nbsp; ${sch?'':SOC.confirm===p.id?`<button class="linkbtn" style="color:#A33A12" type="button" data-so-rm="${esc(p.id)}">Remove from list?</button>`:`<button class="linkbtn" type="button" data-so-ask="${esc(p.id)}" title="Takes it off this list only. It stays on Facebook and Instagram.">Remove</button>`}</td></tr>`}).join('')}</tbody></table></div>`
    :`<div class="empty"><b>No posts yet.</b>${cfg.connected?'Use “New post” to write one, or start from a course.':'Once Facebook is connected, posts you publish from here are listed with their likes and comments.'}</div>`;
  if(KIT.tplOpen)setTimeout(ktPreview);
  return head+kitTplCard()+kitGrid()+kitCal()+`<h2 class="em-h">Posted from here</h2>`+list+`<p class="hint" style="max-width:760px;margin-top:14px">Facebook schedules its own posts. Instagram can’t, so scheduled Instagram posts go out with the first visit to the admin after the chosen time, or when someone opens Social. Numbers refresh at most every 10 minutes.</p>`}
function socSync(){const c=SOC.c;if(!c)return;const v=id=>{const e=document.getElementById(id);return e?e.value:null};
  const t=v('soText');if(t!==null)c.text=t;const it=v('soIgText');if(it!==null)c.igText=it;const l=v('soLink');if(l!==null)c.link=l.trim();const at=v('soAt');if(at!==null)c.at=at;
  const w=document.querySelector('#soForm input[name=soWhen]:checked');if(w)c.when=w.value}
function socPaintPrev(){const p=document.getElementById('soPrev');if(p)p.innerHTML=socPreviews();const n=document.getElementById('soCount');if(n)n.innerHTML=socCounts();
  const s=document.querySelector('#soForm button[type=submit]');if(s&&!SOC.busy)s.textContent=SOC.c.when==='later'?'Schedule':'Post now'}
function socRepaint(){socSync();socPaint()}
app.addEventListener('input',e=>{if(!e.target.closest('#soForm'))return;const id=e.target.id;
  if(id==='soBg'){SOC.c.bg=e.target.value;socPaintPrev();document.querySelectorAll('[data-so-bg]').forEach(x=>x.setAttribute('aria-pressed','false'));return}
  socSync();socPaintPrev()});
app.addEventListener('change',async e=>{
  if(e.target.id==='soPage'){try{await api('metaconfig',{pageId:e.target.value});SOC.cfg=await api('metaconfig');toast('Now posting as '+SOC.cfg.page.name);socPaint()}catch(err){toast(err.message)}return}
  if(!e.target.closest('#soForm'))return;const c=SOC.c,id=e.target.id;
  if(id==='soFb'){c.fb=e.target.checked;socRepaint();return}
  if(id==='soIg'){c.ig=e.target.checked;socRepaint();return}
  if(id==='soSame'){socSync();c.same=e.target.checked;if(!c.same&&!c.igText)c.igText=c.text;socPaint();return}
  if(id==='soBook'){socSync();const b=bookById(e.target.value);if(b)Object.assign(c,socFromBook(b),{igText:''});else c.bookId='';socPaint();return}
  if(id==='soSpread'&&e.target.value){socSync();c.image=e.target.value;c.frame='none';socPaint();return}
  if(id==='soFile'){const f=e.target.files[0];if(!f)return;socSync();const m=document.getElementById('soMsg');if(m)m.textContent='Uploading…';
    try{const bl=await socFileJpeg(f);const fd=new FormData();fd.append('file',bl,'upload.jpg');const r=await api('upload',fd,true);c.image=r.path;socPaint()}catch(err){if(m)m.textContent=err.message}return}
  if(e.target.name==='soWhen'){socSync();socPaintPrev();if(c.when==='later'){const a=document.getElementById('soAt');if(a&&!a.value)a.focus()}}
});
app.addEventListener('click',async e=>{
  if(!e.target.closest('#soc'))return;if(e.target.matches&&e.target.matches('[data-so-backdrop]')){SOC.modal=false;SOC.setup=false;socPaint();return}
  const t=e.target.closest('[data-so],[data-so-frame],[data-so-bg],[data-so-cancel],[data-so-again],[data-so-ask],[data-so-rm]');if(!t)return;const D=t.dataset,a=D.so;
  if(a==='modal'){SOC.modal=true;socPaint();setTimeout(()=>{const f=document.querySelector('.so-dialog input,.so-dialog .btn');if(f)f.focus()});return}
  if(a==='modalclose'){SOC.modal=false;SOC.setup=false;socPaint();return}
  if(a==='setup'){SOC.setup=true;socPaint();return}
  if(a==='setupcancel'){SOC.setup=false;socPaint();return}
  if(a==='copyuri'){try{await navigator.clipboard.writeText(SOC.cfg.redirectUri);toast('Copied')}catch(_){toast('Select the address and copy it')}return}
  if(a==='forget'||a==='disconnect'){if(D.sure!=='1'){t.dataset.sure='1';t.textContent=a==='forget'?'Remove for good?':'Disconnect for good?';return}
    try{await api('metaconfig',a==='forget'?{forget:true}:{disconnect:true});SOC.cfg=await api('metaconfig');SOC.setup=false;toast(a==='forget'?'App removed':'Disconnected');socPaint()}catch(err){toast(err.message)}return}
  if(a==='reload'){t.disabled=true;t.textContent='Refreshing…';await socLoad(true);return}
  if(a==='new'){SOC.c=socNew({ig:!!SOC.cfg.ig});socPaint();return}
  if(a==='close'){SOC.c=null;socPaint();return}
  if(a==='cover'){socSync();const b=bookById(SOC.c.bookId);if(b){SOC.c.image=b.cover;SOC.c.frame='4:5'}socPaint();return}
  if(a==='noimg'){socSync();SOC.c.image='';socPaint();return}
  if(a==='nocar'){socSync();SOC.c.images=null;socPaint();return}
  if(D.soFrame){socSync();SOC.c.frame=D.soFrame;socPaint();return}
  if(D.soBg){SOC.c.bg=D.soBg;const i=document.getElementById('soBg');if(i)i.value=/^#[0-9a-f]{6}$/i.test(D.soBg)?D.soBg:'#ffffff';document.querySelectorAll('[data-so-bg]').forEach(x=>x.setAttribute('aria-pressed',String(x===t)));socPaintPrev();return}
  if(D.soAgain){const p=(SOC.posts||[]).find(x=>x.id===D.soAgain);if(p){SOC.c=socNew({bookId:p.bookId||'',text:p.text||'',igText:p.igText||'',same:(p.igText||p.text)===p.text,link:p.link||'',image:p.image||'',frame:p.frame||'none',fb:!!p.channels.facebook,ig:!!p.channels.instagram&&!!SOC.cfg.ig});socPaint();window.scrollTo(0,0)}return}
  if(D.soAsk){SOC.confirm=D.soAsk;socPaint();return}
  if(D.soRm){try{await api('socialremove',{id:D.soRm});SOC.posts=SOC.posts.filter(x=>x.id!==D.soRm);SOC.confirm=null;socPaint()}catch(err){toast(err.message)}return}
  if(D.soCancel){t.disabled=true;try{const r=await api('socialcancel',{id:D.soCancel});const i=SOC.posts.findIndex(x=>x.id===D.soCancel);if(i>=0)SOC.posts[i]=r.post;toast('Cancelled. It won’t be posted.');socPaint()}catch(err){toast(err.message);t.disabled=false}return}
});
app.addEventListener('submit',async e=>{
  if(e.target.id==='metaForm'){e.preventDefault();const m=document.getElementById('mtMsg');m.textContent='Checking with Meta…';
    try{await api('metaconfig',{appId:document.getElementById('mtId').value,appSecret:document.getElementById('mtSec').value.trim(),configId:(document.getElementById('mtCfg')||{}).value||''});SOC.cfg=await api('metaconfig');SOC.setup=false;toast('Saved. Now connect with Facebook.');socPaint()}catch(err){m.textContent=err.message}return}
  if(e.target.id!=='soForm')return;e.preventDefault();socSync();const c=SOC.c,m=document.getElementById('soMsg');
  const ig=c.ig&&!!SOC.cfg.ig;
  if(!c.fb&&!ig){m.textContent='Choose Facebook, Instagram or both.';return}
  if(ig&&!c.image){m.textContent='Instagram needs a picture.';return}
  let when='now';if(c.when==='later'){if(!c.at){m.textContent='Choose the date and time.';return}when=new Date(c.at).toISOString()}
  SOC.busy=true;const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Preparing the picture…';m.textContent='';let image='',images;try{if(c.images&&c.images.length>1)images=c.images;else if(c.image)image=await socPrep(c.image,c.frame,c.bg)}catch(err){SOC.busy=false;m.textContent=err.message;btn.disabled=false;btn.textContent=when==='now'?'Post now':'Schedule';return}btn.textContent=when==='now'?'Posting…':'Scheduling…';m.textContent=ig&&when==='now'?'Instagram can take up to half a minute…':'';
  try{const r=await api('socialpost',{text:c.text,igText:c.same?c.text:c.igText,link:c.link,image,images,bookId:c.bookId,facebook:c.fb,instagram:ig,when});
    SOC.busy=false;const ch=Object.entries(r.post.channels);const bad=ch.filter(([,x])=>x.status==='failed');
    if(r.saved)SOC.posts=[r.post,...(SOC.posts||[])];
    if(bad.length===ch.length){m.textContent='Didn’t post: '+bad.map(([k,x])=>(k==='facebook'?'Facebook':'Instagram')+': '+x.error).join(' · ');btn.disabled=false;btn.textContent=when==='now'?'Post now':'Schedule';return}
    SOC.c=null;socPaint();toast(bad.length?'Posted, but '+(bad[0][0]==='facebook'?'Facebook':'Instagram')+' didn’t work. See the list.':when==='now'?'Posted':'Scheduled')}
  catch(err){SOC.busy=false;m.textContent=err.message;btn.disabled=false;btn.textContent=when==='now'?'Post now':'Schedule'}
});
/* ---------- Social kit: posts, pictures and the content calendar for each book ---------- */
const KIT={book:null,plan:null,q:'',f:'space',month:0,drafts:{},sizes:{},pics:{},markId:null};
const KIT_PL=[
  {k:'instagram',n:'Instagram',max:2200,size:'portrait',tip:'Links in captions don’t click: say “link in bio” and put the link in your bio or a story link sticker.'},
  {k:'facebook',n:'Facebook',max:2000,size:'landscape',tip:'The link makes its own preview card from the course page.'},
  {k:'linkedin',n:'LinkedIn',max:3000,size:'landscape',tip:'Professional tone: the teacher, the qualification, why it matters to families.'},
  {k:'x',n:'X',max:280,size:'landscape',tip:'280 characters; every link counts as 23.'},
  {k:'threads',n:'Threads',max:500,size:'portrait',tip:'500 characters. Links click, and add a preview card.'},
  {k:'bluesky',n:'Bluesky',max:300,size:'landscape',tip:'300 characters. Paste the link and wait for the card before posting.'}];
const KIT_SIZES={square:{n:'Square post',w:1080,h:1080},portrait:{n:'Portrait post',w:1080,h:1350},story:{n:'Story / Reel cover',w:1080,h:1920},landscape:{n:'Landscape / link card',w:1200,h:630}};
const kitPl=k=>KIT_PL.find(p=>p.k===k)||{n:k};
const kitTag=s=>'#'+String(s||'').replace(/&/g,' and ').replace(/^the\s+/i,'').normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join('');
const KIT_LVL={'KS3':'#KS3','Pre-GCSE':'#PreGCSE','GCSE':'#GCSE','iGCSE':'#IGCSE','IGCSE':'#IGCSE','A-Level':'#ALevel','A Level':'#ALevel','Workshop':'#Workshop'};
function kitTags(b){const t=['#OHSOED','#HomeEducation'];if(b.category)t.push(KIT_LVL[b.category]||kitTag(b.category));if(b.subject)t.push(kitTag(b.subject));if(b.status==='next')t.push('#NowEnrolling');return [...new Set(t)].join(' ')}
const kitBase=()=>emSiteBase();
function kitLink(b,pl){return kitBase()+'s/'+encodeURIComponent(b.id)+'?utm_source='+pl+'&utm_medium=social&utm_campaign='+encodeURIComponent(b.id)}
const kitMonth=d=>d?MONTHS[+d.slice(5,7)-1]+' '+d.slice(0,4):'';
function kitSpec(b){return b.specs||''}
const KIT_WHERE_DEF=['instagram','x','threads','bluesky'];
const kitWhereDefault=()=>{let w=null;try{w=JSON.parse(localStorage.getItem('ose-social-where')||'null')}catch(_){}return Array.isArray(w)&&w.length?w.filter(k=>KIT_PL.some(p=>p.k===k)):KIT_WHERE_DEF.slice()};
const kitWhere=()=>{if(!KIT.where)KIT.where=kitWhereDefault();return KIT.where};
const kitOrder=()=>{if(!KIT.order){let o=null;try{o=JSON.parse(localStorage.getItem('ose-social-order')||'null')}catch(_){}o=Array.isArray(o)?o.filter(k=>KIT_PL.some(p=>p.k===k)):[];KIT.order=[...o,...KIT_PL.map(p=>p.k).filter(k=>!o.includes(k))]}return KIT.order};
const kitOrdered=()=>kitOrder().map(k=>KIT_PL.find(p=>p.k===k));
function kitSetOrder(o){KIT.order=o;try{localStorage.setItem('ose-social-order',JSON.stringify(o))}catch(_){}}
const kitShown=()=>kitOrdered().filter(p=>kitWhere().includes(p.k));
const kitMaster=()=>(kitShown()[0]||KIT_PL[0]).k;
const kitDate=pl=>{const d=KIT.dates||{},m=kitMaster();return KIT.dateAll&&pl!==m&&!(KIT.dateOv||{})[pl]?(d[m]||''):(d[pl]||'')};
const kitCount=(pl,t)=>pl==='x'?String(t).replace(/https?:\/\/\S+/g,'x'.repeat(23)).length:String(t).length;

/* ---- pictures: the cover whole, with the title beside or below it in the book's colour (never over the picture) ---- */
const kitImg={};
function kitLoadImg(src){if(!kitImg[src])kitImg[src]=new Promise((ok,no)=>{const i=new Image();if(/^https?:/.test(src)&&!src.startsWith(location.origin))i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=no;i.src=src});return kitImg[src]}
function kitHex(h){const m=/^#?([0-9a-f]{6})$/i.exec(h||'');return m?[0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16)):[230,234,233]}
function kitLum([r,g,b]){const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)}
function kitWrap(ctx,text,maxW){const words=String(text).split(/\s+/).filter(Boolean),lines=[];let cur='';for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width<=maxW||!cur)cur=t;else{lines.push(cur);cur=w}}if(cur)lines.push(cur);return lines}
// lay text blocks into a box, shrinking the title until everything fits; returns the drawing plan
const KIT_TPL_DEF={bg:'book',bgColor:'#F3F4FA',tone:'auto',coverAlign:'left',textAlign:'top',coverSize:100,titleSize:100,shadow:true,eyebrow:true,subtitle:true,partner:true,url:true,urlText:'',logo:'auto',logoSize:100};
const kitT=()=>Object.assign({},KIT_TPL_DEF,KIT.tpl||{},KIT.tplDraft||{});
const kitSaved=()=>Object.assign({},KIT_TPL_DEF,KIT.tpl||{});
function kitText(ctx,b,box,S,tone,T){
  const eyebrow=(b.status==='next'?'Starts '+(b.pubDate?kitMonth(b.pubDate):'next year'):b.status==='space'?'Space available'+(b.places&&b.places<=3?' · '+b.places+(b.places===1?' place left':' places left'):''):b.status==='workshop'?'Workshop'+(b.pubDate?' · '+fmtDate(b.pubDate,false):''):(b.category||'OH-SO ED')).toUpperCase();
  let last=null;
  for(let fs=S.title;fs>=S.title*.42;fs-=2){
    const plan=[];let y=0;
    if(T.eyebrow){ctx.font=`600 ${S.eye}px Jost, Arial, sans-serif`;kitWrap(ctx,eyebrow,box.w).forEach(l=>{plan.push({t:l,f:ctx.font,y:y+S.eye,c:tone.muted,ls:.12});y+=S.eye*1.35});y+=S.eye*.9}
    ctx.font=`600 ${fs}px Jost, Arial, sans-serif`;const tL=kitWrap(ctx,b.title,box.w);if(tL.some(l=>ctx.measureText(l).width>box.w))continue;tL.forEach(l=>{plan.push({t:l,f:ctx.font,y:y+fs*.9,c:tone.ink});y+=fs*1.04});
    if(T.subtitle&&b.subtitle){y+=fs*.22;const sf=Math.max(S.sub*.75,Math.min(S.sub,fs*.5));ctx.font=`500 ${sf}px Jost, Arial, sans-serif`;kitWrap(ctx,b.subtitle,box.w).forEach(l=>{plan.push({t:l,f:ctx.font,y:y+sf,c:tone.ink});y+=sf*1.25})}
    if(T.partner&&b.partner){y+=S.small*.9;ctx.font=`400 ${S.small}px Jost, Arial, sans-serif`;kitWrap(ctx,'Taught by '+b.partner,box.w).slice(0,3).forEach(l=>{plan.push({t:l,f:ctx.font,y:y+S.small,c:tone.muted});y+=S.small*1.35})}
    last={plan,h:y};if(y<=box.h)return last}
  return last} // never lose the title: the smallest try if nothing fits
function kitDrawText(ctx,res,x,y,center){ctx.textAlign=center?'center':'left';res.plan.forEach(p=>{ctx.font=p.f;ctx.fillStyle=p.c;if(p.ls&&'letterSpacing' in ctx)ctx.letterSpacing=(p.ls*parseFloat(p.f.match(/(\d+(\.\d+)?)px/)[1]))+'px';ctx.fillText(p.t,x,y+p.y);if('letterSpacing' in ctx)ctx.letterSpacing='0px'});ctx.textAlign='left'}
function kitCover(ctx,img,x,y,w,h,shadow,align){const s=Math.min(w/img.naturalWidth,h/img.naturalHeight),cw=Math.round(img.naturalWidth*s),ch=Math.round(img.naturalHeight*s),cx=Math.round(align==='left'?x:x+(w-cw)/2),cy=Math.round(y+(h-ch)/2);
  if(shadow){ctx.save();ctx.shadowColor='rgba(0,0,0,.28)';ctx.shadowBlur=Math.round(cw*.08);ctx.shadowOffsetY=Math.round(cw*.035);ctx.fillStyle='#fff';ctx.fillRect(cx,cy,cw,ch);ctx.restore()}ctx.drawImage(img,cx,cy,cw,ch);return {x:cx,y:cy,w:cw,h:ch}}
let kitLogoI=null;
function kitTint(img,col){const c=document.createElement('canvas');c.width=img.naturalWidth||773;c.height=img.naturalHeight||224;const x=c.getContext('2d');x.drawImage(img,0,0,c.width,c.height);if(col){x.globalCompositeOperation='source-in';x.fillStyle=col;x.fillRect(0,0,c.width,c.height)}return c}
function kitLogo(ctx,right,bottom,h,bg,mode,ink){ // the site logo, right/bottom aligned
  if(mode==='none'||!kitLogoI)return 0;
  const L=kitLum(bg),auto=ink||((1.05/(L+.05))>=((L+.05)/.05)?'#FFFFFF':'#000000'); // auto: the same colour as the text
  const col=mode==='white'?'#FFFFFF':mode==='black'?'#000000':mode==='brand'?(L<.32?'':'#0F1747'):auto; // brand: as the logo is on a dark background, navy on a light one
  const ar=(kitLogoI.naturalWidth||773)/(kitLogoI.naturalHeight||224),lh=h*.55,w=lh*ar;
  ctx.drawImage(kitTint(kitLogoI,col),right-w,bottom-lh,w,lh);return w}
async function kitRender(b,size,tpl){
  const T=Object.assign({},KIT_TPL_DEF,tpl||kitSaved());
  const Z=KIT_SIZES[size],W=Z.w,H=Z.h,cv=document.createElement('canvas');cv.width=W;cv.height=H;const ctx=cv.getContext('2d');
  try{await Promise.all(['400 60px Jost','500 30px Jost','600 30px Jost'].map(f=>document.fonts.load(f)))}catch(_){}if(!kitLogoI&&BOOT.logo){try{kitLogoI=await kitLoadImg(BOOT.logo)}catch(_){}}
  const rgb=kitHex(T.bg==='custom'?T.bgColor:b.tileColor),dark=T.tone==='light'?true:T.tone==='dark'?false:kitLum(rgb)<.32;
  const tone=dark?{ink:'#FFFFFF',muted:'rgba(255,255,255,.78)'}:{ink:'#1E2828',muted:'rgba(30,40,40,.72)'};
  ctx.fillStyle=`rgb(${rgb.join(',')})`;ctx.fillRect(0,0,W,H);
  let img=null;const cov=b.cover||BOOT.icon;if(cov){try{img=await kitLoadImg(cov)}catch(_){}}
  const r=img?img.naturalWidth/img.naturalHeight:.75,u=W/1080,cs=T.coverSize/100,ts=T.titleSize/100;
  const S={title:86*u*ts,sub:34*u,small:27*u,eye:24*u};
  const urlTxt=(T.urlText||'').trim()||kitBase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const bz=size==='story'?1.4:1;const brand=(x,yb,small,center)=>{if(!T.url)return;ctx.font=`500 ${(small?17:21)*u*bz}px Jost, Arial, sans-serif`;ctx.fillStyle=tone.muted;ctx.textAlign=center?'center':'left';ctx.fillText(urlTxt,x,yb);ctx.textAlign='left'};
  const LH=T.logo==='none'?0:Math.round((size==='story'?150:size==='landscape'?92:120)*u*T.logoSize/100);
  const M=Math.round(84*u);
  if(size==='landscape'||(size==='square'&&r<1.05)){ // cover on the left, text on the right
    const sq=size==='square',m=sq?M:54,foot=sq?(LH||(T.url?30*u:0))+44*u:0; // square: the address and logo sit in a row along the bottom, like portrait
    const ch=(H-2*m-foot)*Math.min(1,cs),cvW=Math.min(W*.46*cs,ch*r),top=m+((H-2*m-foot)-ch)/2;
    const c=img?kitCover(ctx,img,m,top,cvW,ch,T.shadow,'left'):{x:m,y:top,w:cvW,h:ch};
    const tx=c.x+c.w+(sq?70*u:54),tw=W-tx-m;
    const st=sq?S:{title:58*ts,sub:26,small:21,eye:18};
    const room=sq?c.h:c.h-(LH||(T.url?30*u:0))-40*u,res=kitText(ctx,b,{w:tw,h:room},st,tone,T);
    if(res)kitDrawText(ctx,res,tx,T.textAlign==='middle'?c.y+Math.max(0,(room-res.h)/2):c.y-Math.round(st.eye*.2));
    if(sq){const lb=H-M+8*u;brand(M,lb);kitLogo(ctx,W-M,lb,LH,rgb,T.logo,tone.ink)}
    else{brand(tx,H-m-4,true);kitLogo(ctx,W-m,H-m,LH,rgb,T.logo,tone.ink)}
  }else{ // cover on top, text below
    const center=T.coverAlign==='center';
    const top=size==='story'?Math.round(300*u):M,bottom=M,avail=H-top-(size==='story'?Math.round(380*u):M);
    const coverH=(size==='story'?avail*.58:size==='portrait'?avail*.54:avail*.5)*cs,coverW=Math.min(W-2*M,coverH*r);
    const cH=Math.min(coverH,(W-2*M)/r),c=img?kitCover(ctx,img,M,top,W-2*M,cH,T.shadow,center?'center':'left'):{x:M,y:top,w:coverW,h:coverH};
    const k2=size==='story'?1.4:1.15,S2={title:S.title*k2,sub:S.sub*k2,small:S.small*k2,eye:S.eye*k2};
    const ty=c.y+c.h+64*u,res=kitText(ctx,b,{w:W-2*M-(center?0:0),h:H-bottom-ty-(LH||(T.url?30*u:0))-40*u},S2,tone,T);
    if(res)kitDrawText(ctx,res,center?W/2:M,ty,center);
    const lb=H-M+8*u;brand(M,lb);kitLogo(ctx,W-M,lb,LH,rgb,T.logo,tone.ink); // always the bottom-right corner, story included
  }
  return cv}
/* ---- the shared picture template (one for the whole team) ---- */
function kitTplCard(){
  const T=kitT(),dirty=!!KIT.tplDraft,b=bookById(KIT.tplBook)||[...state.books].find(x=>x.status==='space'&&x.cover)||state.books.find(x=>x.cover)||state.books[0];
  if(!KIT.tplOpen)return `<div class="em-card kit-tplbar"><div><b>Picture template</b><p class="hint" style="margin:0">One layout for every course’s social pictures: background, picture, text and logo. Changes apply for everyone.</p></div><button class="btn small" type="button" data-kt="open">Edit template</button></div>`;
  const seg=(k,opts)=>`<div class="em-seg">${opts.map(([v,l])=>`<button type="button" data-kt-set="${k}" data-v="${v}" aria-pressed="${String(T[k])===String(v)}">${l}</button>`).join('')}</div>`;
  const chk=(k,l)=>`<label class="check"><input type="checkbox" data-kt-chk="${k}"${T[k]?' checked':''}> ${l}</label>`;
  const rng=(k,l,mn,mx)=>`<label class="kit-rng"><span>${l}</span><input type="range" min="${mn}" max="${mx}" step="5" value="${T[k]}" data-kt-rng="${k}"><output>${T[k]}%</output></label>`;
  const books=[...state.books].sort((a,c)=>String(a.title).localeCompare(String(c.title)));
  setTimeout(ktPreview);
  return `<div class="em-card kit-tpl"><div class="kit-tplhead"><b>Picture template</b>${dirty?'<span class="pill sub-pending">Not saved</span>':''}<span style="margin-left:auto"></span><label class="hint">Preview with <select id="ktBook">${books.map(x=>`<option value="${esc(x.id)}"${b&&x.id===b.id?' selected':''}>${esc(x.title)}</option>`).join('')}</select></label></div>
    <div class="kit-tplgrid"><div class="kit-tplctl">
      <div class="field"><span class="em-lbl">Background</span>${seg('bg',[['book','Subject colour'],['custom','One colour']])}${T.bg==='custom'?`<div class="so-row so-bgs">${[['#F3F4FA','Mist'],['#FFFFFF','White'],['#0F1747','Navy'],['#E3CD4B','Mustard'],['#171B2B','Ink']].map(([v,l])=>`<button type="button" class="so-sw" data-kt-set="bgColor" data-v="${v}" title="${l}" aria-pressed="${T.bgColor.toLowerCase()===v.toLowerCase()}" style="background:${v}"></button>`).join('')}<input type="color" data-kt-col="bgColor" value="${esc(T.bgColor)}" aria-label="Other colour"></div>`:''}</div>
      <div class="field"><span class="em-lbl">Text colour</span>${seg('tone',[['auto','Automatic'],['dark','Dark'],['light','Light']])}</div>
      <div class="field"><span class="em-lbl">Picture (portrait and story)</span>${seg('coverAlign',[['left','Left, in line with the text'],['center','Centred']])}</div>
      <div class="field"><span class="em-lbl">Text beside the picture (square and landscape)</span>${seg('textAlign',[['top','Level with the top'],['middle','Middle']])}</div>
      ${rng('coverSize','Picture size',80,115)}${rng('titleSize','Title size',70,130)}
      <div class="field"><span class="em-lbl">Show</span><div class="kit-chks">${chk('eyebrow','Label (Space available, Starts September…)')}${chk('subtitle','Exam board or level')}${chk('partner','Teacher')}${chk('url','Web address')}${chk('shadow','Shadow under the picture')}</div>${T.url?`<input type="text" data-kt-txt="urlText" value="${esc(T.urlText)}" placeholder="${esc(kitBase().replace(/^https?:\/\//,'').replace(/\/$/,''))}" aria-label="Web address text" style="margin-top:6px">`:''}</div>
      <div class="field"><span class="em-lbl">Logo, bottom right</span>${seg('logo',[['auto','Same as the text'],['white','White'],['black','Black'],['brand','OH-SO ED colours'],['none','None']])}</div>
      ${T.logo!=='none'?rng('logoSize','Logo size',70,140):''}
      <div class="so-row" style="margin-top:4px"><button class="btn solid small" type="button" data-kt="save"${dirty?'':' disabled'}>Save template</button><button class="linkbtn" type="button" data-kt="discard"${dirty?'':' disabled'}>Discard changes</button><button class="linkbtn" type="button" data-kt="default">Back to the original</button><button class="linkbtn" type="button" data-kt="close" style="margin-left:auto">Close</button></div>
    </div><div class="kit-tplprev">${Object.entries(KIT_SIZES).map(([k,z])=>`<figure class="kit-pic"><div class="kit-picbox" style="aspect-ratio:${z.w}/${z.h}"><img data-kt-pic="${k}" alt="${esc(z.n)} preview"></div><figcaption><b>${z.n}</b></figcaption></figure>`).join('')}</div></div></div>`}
let ktTimer=0;
function ktPreview(){clearTimeout(ktTimer);ktTimer=setTimeout(async()=>{const b=bookById(KIT.tplBook)||[...state.books].find(x=>x.status==='space'&&x.cover)||state.books.find(x=>x.cover)||state.books[0];if(!b)return;const T=kitT();
  for(const k of Object.keys(KIT_SIZES)){const el=document.querySelector(`[data-kt-pic="${k}"]`);if(!el)return;try{const cv=await kitRender(b,k,T);el.src=cv.toDataURL('image/jpeg',.85)}catch(_){}}},120)}
function ktSet(k,v){KIT.tplDraft=Object.assign({},KIT.tplDraft||{},{[k]:v});const base=Object.assign({},KIT_TPL_DEF,KIT.tpl||{});if(Object.keys(KIT.tplDraft).every(x=>String(KIT.tplDraft[x])===String(base[x])))KIT.tplDraft=null}
function ktRepaint(){socPaint();ktPreview()}
app.addEventListener('click',async e=>{
  if(!e.target.closest('#soc'))return;const t=e.target.closest('[data-kt],[data-kt-set]');if(!t)return;
  if(t.dataset.ktSet){ktSet(t.dataset.ktSet,t.dataset.v);ktRepaint();return}
  const a=t.dataset.kt;
  if(a==='open'){KIT.tplOpen=true;ktRepaint();return}
  if(a==='close'){if(KIT.tplDraft&&t.dataset.sure!=='1'){t.dataset.sure='1';t.textContent='Close without saving?';return}KIT.tplDraft=null;KIT.tplOpen=false;socPaint();return}
  if(a==='discard'){KIT.tplDraft=null;ktRepaint();return}
  if(a==='default'){const base=kitSaved();KIT.tplDraft=Object.keys(KIT_TPL_DEF).every(x=>String(base[x])===String(KIT_TPL_DEF[x]))?null:Object.assign({},KIT_TPL_DEF);ktRepaint();return}
  if(a==='save'){t.disabled=true;try{const r=await api('socialtplsave',{template:kitT()});KIT.tpl=r.template;KIT.tplDraft=null;KIT.pics={};toast('Template saved. Every course’s pictures now use it.');ktRepaint()}catch(err){toast(err.message);t.disabled=false}return}
});
app.addEventListener('input',e=>{const D=e.target.dataset||{};if(!e.target.closest||!e.target.closest('.kit-tpl'))return;
  if(D.ktRng){ktSet(D.ktRng,+e.target.value);const o=e.target.nextElementSibling;if(o)o.textContent=e.target.value+'%';ktPreview();ktBadge();return}
  if(D.ktCol){ktSet(D.ktCol,e.target.value);document.querySelectorAll('[data-kt-set="bgColor"]').forEach(x=>x.setAttribute('aria-pressed','false'));ktPreview();ktBadge();return}
  if(D.ktTxt){ktSet(D.ktTxt,e.target.value);ktPreview();ktBadge();return}});
app.addEventListener('change',e=>{if(e.target.id==='ktBook'){KIT.tplBook=e.target.value;ktPreview();return}const D=e.target.dataset||{};if(D.ktChk){ktSet(D.ktChk,e.target.checked);ktRepaint()}});
function ktBadge(){const h=document.querySelector('.kit-tplhead');if(!h)return;const p=h.querySelector('.pill');if(KIT.tplDraft&&!p)h.querySelector('b').insertAdjacentHTML('afterend','<span class="pill sub-pending">Not saved</span>');if(!KIT.tplDraft&&p)p.remove();const s=document.querySelector('[data-kt="save"]'),d=document.querySelector('[data-kt="discard"]');if(s)s.disabled=!KIT.tplDraft;if(d)d.disabled=!KIT.tplDraft}
async function kitPics(b){for(const k of Object.keys(KIT_SIZES)){if(KIT.book!==b.id)return;if(KIT.pics[b.id+'/'+k])continue;try{const cv=await kitRender(b,k);KIT.pics[b.id+'/'+k]=cv.toDataURL('image/jpeg',.9);const el=document.querySelector(`[data-kit-pic="${k}"]`);if(el)el.src=KIT.pics[b.id+'/'+k]}catch(_){}}}
async function kitBlob(b,size,type){const cv=await kitRender(b,size);return new Promise(ok=>cv.toBlob(ok,type||'image/png',.92))}
async function kitDownload(b,size){const bl=await kitBlob(b,size,'image/png');const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=`ohsoed-${b.id}-${size}-${KIT_SIZES[size].w}x${KIT_SIZES[size].h}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}

/* ---- views ---- */
async function kitPlanLoad(){try{KIT.plan=(await api('socialplan')).plan||[]}catch(e){KIT.plan=[];toast(e.message)}socPaint()}
const kitStat=x=>x.status==='next'?'Next year':x.status==='space'?'Space available':x.status==='workshop'?'Workshop':'Full or waiting list';
function kitGrid(){
  const q=KIT.q.toLowerCase(),f=KIT.f;
  const L=[...state.books].filter(b=>f==='all'||b.status===f).filter(b=>!q||(b.title+' '+(b.subtitle||'')+' '+(b.partner||'')+' '+(b.subject||'')).toLowerCase().includes(q))
    .sort((a,b)=>(f==='next'||f==='workshop')?String(a.pubDate).localeCompare(String(b.pubDate)):0);
  const n=k=>state.books.filter(b=>k==='all'||b.status===k).length;
  const chips=[['space','Space available'],['next','Next year'],['workshop','Workshops'],['all','All']].map(([k,l])=>`<button type="button" class="cms-chip" data-kitf="${k}" aria-pressed="${f===k}">${l} <span>${n(k)}</span></button>`).join('');
  return `<h2 class="em-h">Make posts for a course</h2><p class="hint" style="margin:-4px 0 14px;max-width:760px">Choose a course or workshop: you get post text for each platform, its link with tracking tags, hashtags, and pictures in every size.</p>
    <div class="cms-filters">${chips}<input id="kitQ" type="search" placeholder="Search courses" value="${esc(KIT.q)}" aria-label="Search courses" class="kit-q"></div>
    ${L.length?`<div class="kit-grid">${L.slice(0,KIT.all?120:12).map(b=>`<button type="button" class="kit-tile" data-kit-open="${esc(b.id)}"><span class="kit-th" style="background:${esc(b.tileColor||'#E6EAE9')}">${b.cover?`<img src="${esc(b.cover)}" alt="" loading="lazy">`:`<i>${esc(b.subject||b.title)}</i>`}</span><b>${esc(b.title)}</b><span>${esc([kitStat(b),b.status==='next'&&b.pubDate?kitMonth(b.pubDate):b.status==='workshop'&&b.pubDate?fmtDate(b.pubDate,false):b.partner].filter(Boolean).join(' · '))}</span></button>`).join('')}</div>${L.length>(KIT.all?120:12)?`<p style="margin-top:12px">${KIT.all?`<span class="hint">Showing 120 of ${L.length}. Search to find others.</span>`:`<button class="btn small" type="button" data-kit-all>Show all ${L.length}</button>`}</p>`:''}`:'<div class="empty"><b>Nothing here.</b> Try another filter.</div>'}`}
function kitCal(){
  const P=KIT.plan;if(!P)return '<h2 class="em-h">Calendar</h2><p class="hint"><span class="spin"></span>Loading…</p>';
  const posts=(SOC.posts||[]).flatMap(p=>Object.entries(p.channels||{}).filter(([,c])=>['posted','scheduled','processing'].includes(c.status)).map(([k,c])=>({date:(c.at||p.at||p.created||'').slice(0,10),platform:k,live:c.status,url:c.url,bookId:p.bookId,text:p.text})));
  const items=[...P.map(x=>({...x,plan:true})),...posts];
  const d0=new Date();d0.setDate(1);d0.setMonth(d0.getMonth()+KIT.month);const first=new Date(d0);const dow=(first.getDay()+6)%7;first.setDate(first.getDate()-dow);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today=iso(new Date()),days=[];for(let i=0;i<42;i++){const d=new Date(first);d.setDate(first.getDate()+i);days.push(d)}
  const chip=x=>{const bk=x.bookId?bookById(x.bookId):null;const t=(bk?bk.title:(x.text||'').slice(0,40))||'Post';return `<span class="kit-chip pl-${esc(x.platform)}${x.plan&&x.status==='posted'||x.live==='posted'?' done':''}" title="${esc(kitPl(x.platform).n+': '+t)}">${esc(kitPl(x.platform).n)} · ${esc(t)}</span>`};
  const grid=days.map(d=>{const k=iso(d),its=items.filter(x=>x.date===k);return `<div class="kit-day${d.getMonth()!==d0.getMonth()?' out':''}${k===today?' today':''}"><span class="kit-dn">${d.getDate()}</span>${its.slice(0,4).map(chip).join('')}${its.length>4?`<span class="kit-more">+${its.length-4} more</span>`:''}</div>`}).join('');
  const todo=P.filter(x=>x.status!=='posted').sort((a,b)=>a.date.localeCompare(b.date)),done=P.filter(x=>x.status==='posted').sort((a,b)=>String(b.postedAt).localeCompare(String(a.postedAt)));
  const row=(x,isDone)=>{const bk=x.bookId?bookById(x.bookId):null;return `<tr><td class="mono" style="white-space:nowrap">${esc(fmtDate(x.date,true))}</td><td><span class="kit-chip pl-${esc(x.platform)}">${esc(kitPl(x.platform).n)}</span></td><td><b>${esc(bk?bk.title:'')}</b><div class="muted" style="font-size:12.5px">${esc((x.text||'').slice(0,110))}${(x.text||'').length>110?'…':''}</div></td><td class="muted" style="font-size:13px;white-space:nowrap">${esc((KIT_SIZES[x.size]||{}).n||'')}</td>
    <td style="text-align:right;white-space:nowrap">${isDone?(x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">View</a> &nbsp; `:'')+`<button class="linkbtn" type="button" data-kit-undo="${esc(x.id)}">Not posted</button>`:KIT.markId===x.id?`<form class="kit-mark" data-kit-markf="${esc(x.id)}"><input type="url" placeholder="Link to the post (optional)" aria-label="Link to the post"><button class="btn solid small" type="submit">Mark posted</button><button class="linkbtn" type="button" data-kit-mark="">Cancel</button></form>`:`${bk?`<button class="linkbtn" type="button" data-kit-open="${esc(bk.id)}">Open</button> &nbsp; `:''}<button class="linkbtn" type="button" data-kit-copyp="${esc(x.id)}">Copy text</button> &nbsp; <button class="linkbtn" type="button" data-kit-mark="${esc(x.id)}">Mark posted</button>`} &nbsp; <button class="linkbtn" type="button" data-kit-del="${esc(x.id)}" title="Remove from the calendar">✕</button></td></tr>`};
  return `<h2 class="em-h">Calendar</h2><div class="kit-cal"><div class="kit-calbar"><button class="btn small" type="button" data-kit-m="-1" aria-label="Previous month">‹</button><b>${MONTHS[d0.getMonth()]} ${d0.getFullYear()}</b><button class="btn small" type="button" data-kit-m="1" aria-label="Next month">›</button>${KIT.month?'<button class="linkbtn" type="button" data-kit-m="0">Today</button>':''}</div>
    <div class="kit-week">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}</div><div class="kit-days">${grid}</div></div>
    <h3 class="kit-h3">To post</h3>${todo.length?`<div class="tbl-wrap"><table class="tbl">${todo.map(x=>row(x,false)).join('')}</table></div>`:'<p class="hint">Nothing planned. Open a course above and use “Save to calendar”.</p>'}
    ${done.length?`<h3 class="kit-h3">Posted</h3><div class="tbl-wrap"><table class="tbl">${done.slice(0,30).map(x=>row(x,true)).join('')}</table></div>`:''}`}
function kitBookView(){
  const b=bookById(KIT.book);if(!b){KIT.book=null;return ''}
  const cfg=SOC.cfg||{};const tags=kbTagsNow(b);
  if(!KIT.drafts[b.id]){KIT.drafts[b.id]={};KIT_PL.forEach(p=>KIT.drafts[b.id][p.k]=kitBuild(b,p.k))}
  const ED=(KIT.edited||{})[b.id]||{};
  const D=KIT.drafts[b.id];
  const pics=Object.entries(KIT_SIZES).map(([k,z])=>`<figure class="kit-pic"><div class="kit-picbox" style="aspect-ratio:${z.w}/${z.h}"><img data-kit-pic="${k}" alt="${esc(z.n)} picture for ${esc(b.title)}" src="${KIT.pics[b.id+'/'+k]||''}"></div><figcaption><b>${z.n}</b> <span>${z.w} × ${z.h}</span></figcaption><button class="btn small" type="button" data-kit-dl="${k}">Download</button></figure>`).join('');
  const many=kbBooks(b,kbB(b)).length>1;
  KIT.open=KIT.open||{instagram:true};KIT.inc=KIT.inc||{};
  const M=kitMaster(),Mn=kitPl(M).n;
  const dateCell=p=>p.k!==M&&KIT.dateAll&&!(KIT.dateOv||{})[p.k]
    ?`<span class="kit-shared" title="Same as ${Mn}">${kitDate(p.k)?esc(fmtDate(kitDate(p.k),true)):Mn+'’s date'} <button class="linkbtn" type="button" data-kit-ov="${p.k}">Change</button></span>`
    :`<input type="date" data-kit-d="${p.k}" value="${esc((KIT.dates||{})[p.k]||'')}" aria-label="${p.n} date">${p.k===M?(kitShown().length>1?`<label class="kit-all"><input type="checkbox" data-kit-dall${KIT.dateAll?' checked':''}> Use for all</label>`:''):KIT.dateAll?`<button class="linkbtn" type="button" data-kit-ov-off="${p.k}" title="Use ${Mn}’s date">Same as ${Mn}</button>`:''}`;
  const card=p=>{const t=D[p.k],n=kitCount(p.k,t),link=many?kbSectionLink(kbB(b),p.k):kitLink(b,p.k),api=(p.k==='facebook'&&cfg.connected)||(p.k==='instagram'&&cfg.ig),open=!!KIT.open[p.k],inc=true;
    return `<div class="kit-bar${open?' open':''}${inc?'':' off'}" data-kit-pl="${p.k}"><div class="kit-barhead">
      <span class="kit-drag" draggable="true" data-kit-drag="${p.k}" tabindex="0" role="button" aria-label="Move ${p.n}: drag, or use the up and down arrow keys" title="Drag to reorder">⋮⋮</span><button class="kit-tog" type="button" data-kit-tog="${p.k}" aria-expanded="${open}"><span class="kit-chev" aria-hidden="true"></span><b>${p.n}</b></button>
      ${ED[p.k]?`<button class="linkbtn kb-ed" type="button" data-kb-rewrite="${p.k}" title="You edited this draft, so the options above no longer change it">Edited · rewrite</button>`:'<span></span>'}
      <select class="kit-size" data-kit-s="${p.k}" aria-label="${p.n} picture">${Object.entries(KIT_SIZES).filter(([k])=>!(p.k==='instagram'&&k==='landscape')).map(([k,z])=>`<option value="${k}"${(KIT.sizes[p.k]||p.size)===k?' selected':''}>${z.n}</option>`).join('')}</select>
      <span class="mono kit-n ${n>p.max?'so-over':''}" data-kit-n="${p.k}">${n.toLocaleString('en-GB')} / ${p.max.toLocaleString('en-GB')}</span>
      <div class="kit-date">${dateCell(p)}</div></div>
      ${open?`<div class="kit-barbody">
      <textarea rows="9" data-kit-t="${p.k}" aria-label="${p.n} post text">${esc(t)}</textarea>
      <p class="hint" style="margin:0">${esc(p.tip)}</p>
      <div class="so-row"><button class="btn solid small" type="button" data-kit-copy="${p.k}">Copy text</button><span class="kit-link"><span class="hint">Link</span> <button class="linkbtn" type="button" data-kit-copyl="${p.k}" title="${esc(link)}">Copy</button></span>${api?`<button class="btn small" type="button" data-kit-post="${p.k}">Post to ${p.n}…</button>`:''}<span style="margin-left:auto"></span><button class="btn small" type="button" data-kit-save="${p.k}">Save to calendar</button></div>
      ${(p.k==='facebook'||p.k==='instagram')&&!api?`<p class="hint" style="margin:0">To post on ${p.n} from here, connect Facebook and Instagram with Connect to Social, top right of the Social page.</p>`:''}</div>`:''}</div>`};
  const shown=kitShown(),allOpen=shown.every(p=>KIT.open[p.k]);if(shown.length&&!shown.some(p=>KIT.open[p.k])&&!KIT.userClosed)KIT.open[shown[0].k]=true;
  setTimeout(()=>kitPics(b));
  return `<div class="kit-top"><button class="linkbtn kit-back" type="button" data-kit-close>← All courses and the calendar</button>${kbMomBtn()}</div>${SOC.drawer?kbMoments():''}
    <p class="kit-title"><b>${esc(b.title)}</b>${b.subtitle?` · ${esc(b.subtitle)}`:''} <span class="muted">· ${esc([kitStat(b)+(b.status==='next'&&b.pubDate?' ('+kitMonth(b.pubDate)+')':b.status==='workshop'&&b.pubDate?' ('+fmtDate(b.pubDate,true)+')':''),b.partner?'taught by '+b.partner:''].filter(Boolean).join(' · '))}</span></p>
    <p class="kit-tags"><span class="muted">Hashtags</span> <code>${esc(tags)}</code> <button class="linkbtn" type="button" data-kit-copyh>Copy</button></p>
    ${cfg.gated?'<p class="so-warn" style="max-width:900px">The website is still password-protected. Link previews and pictures work, but people who click through will be asked for the preview password until the site goes public.</p>':''}
    <div class="em-card kit-where"><b>Where to post</b><div class="cms-filters" style="margin:0">${kitOrdered().map(p=>`<button type="button" class="cms-chip" data-kit-where="${p.k}" aria-pressed="${kitWhere().includes(p.k)}">${p.n}</button>`).join('')}</div>${kitWhere().join()!==kitWhereDefault().join()&&kitWhere().length?'<label class="kit-wdef"><input type="checkbox" data-kit-wdef> Make this my default</label>':''}</div>
    <h2 class="em-h">Build the post</h2>${kbCard(b)}
    <div class="em-card kit-pics" style="margin-top:16px"><h2 class="em-h" style="margin:0">Pictures</h2><p class="hint" style="margin:0">Made from the teacher’s photo (or the workshop picture), shown whole, with the title set beside or below it (never over the picture), using the picture template on the Social page. Pick a size to download it as a PNG.</p><div class="kit-picrow">${pics}</div></div>
    ${kbSlides(b)}
    <h2 class="em-h">Posts</h2><p class="hint" style="margin:-4px 0 14px;max-width:900px">Drafts for each platform, built from the choices above. Edit them here (an edited draft stops following the choices until you rewrite it), copy them into each app, and save the ones you plan to the calendar. Every link carries tracking tags (utm_source = the platform), so visits from each platform show up separately in website analytics.</p>
    ${shown.length?`<div class="kit-postbar"><button class="linkbtn" type="button" data-kit-expand="${allOpen?0:1}">${allOpen?'Collapse all':'Expand all'}</button><button class="btn solid small" type="button" data-kit-saveall style="margin-left:auto">Save ${shown.length===1?'it':shown.length===2?'both':'all '+shown.length} to the calendar</button></div>
    <div class="kit-posts">${shown.map(card).join('')}</div>`:'<div class="empty"><b>No platforms chosen.</b>Pick where to post at the top of the page.</div>'}`}
/* reorder the platform bars: drag the ⋮⋮ handle, or focus it and press the up/down arrows */
let kitDragK=null;
app.addEventListener('dragstart',e=>{const h=e.target.closest&&e.target.closest('[data-kit-drag]');if(!h)return;kitDragK=h.dataset.kitDrag;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',kitDragK)}catch(_){}const bar=h.closest('.kit-bar');if(bar){bar.classList.add('dragging');try{e.dataTransfer.setDragImage(bar,20,20)}catch(_){}}});
app.addEventListener('dragover',e=>{if(!kitDragK)return;const bar=e.target.closest&&e.target.closest('.kit-bar');if(!bar)return;e.preventDefault();const r=bar.getBoundingClientRect(),after=e.clientY>r.top+r.height/2;document.querySelectorAll('.kit-bar.drop-before,.kit-bar.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));if(bar.dataset.kitPl!==kitDragK)bar.classList.add(after?'drop-after':'drop-before')});
app.addEventListener('drop',e=>{if(!kitDragK)return;const bar=e.target.closest&&e.target.closest('.kit-bar');e.preventDefault();if(bar&&bar.dataset.kitPl!==kitDragK){const after=bar.classList.contains('drop-after'),o=kitOrder().filter(k=>k!==kitDragK);let i=o.indexOf(bar.dataset.kitPl);if(after)i++;o.splice(i,0,kitDragK);kitSetOrder(o)}kitDragK=null;socPaint()});
app.addEventListener('dragend',()=>{if(!kitDragK)return;kitDragK=null;document.querySelectorAll('.kit-bar.dragging,.kit-bar.drop-before,.kit-bar.drop-after').forEach(x=>x.classList.remove('dragging','drop-before','drop-after'))});
app.addEventListener('keydown',e=>{const h=e.target.closest&&e.target.closest('[data-kit-drag]');if(!h||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;e.preventDefault();const k=h.dataset.kitDrag,shown=kitShown().map(p=>p.k),i=shown.indexOf(k),j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=shown.length)return;const o=kitOrder().filter(x=>x!==k);const ref=shown[j];let at=o.indexOf(ref);if(e.key==='ArrowDown')at++;o.splice(at,0,k);kitSetOrder(o);socPaint();const n=document.querySelector(`[data-kit-drag="${k}"]`);if(n)n.focus()});
function copyText(t,msg){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast(msg||'Copied')).catch(()=>{const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();try{document.execCommand('copy');toast(msg||'Copied')}catch(_){toast('Couldn’t copy')}a.remove()})}
app.addEventListener('input',e=>{
  if(e.target.id==='kitQ'){KIT.q=e.target.value;const pos=e.target.selectionStart;socPaint();const i=document.getElementById('kitQ');if(i){i.focus();try{i.setSelectionRange(pos,pos)}catch(_){}}return}
  const t=e.target.dataset&&e.target.dataset.kitT;if(t){const b=bookById(KIT.book);KIT.drafts[b.id][t]=e.target.value;KIT.edited=KIT.edited||{};if(!(KIT.edited[b.id]||{})[t]){(KIT.edited[b.id]=KIT.edited[b.id]||{})[t]=true;const ph=e.target.closest('.kit-bar').querySelector('.kit-barhead > span:not(.kit-n):not(.kit-drag)');if(ph)ph.outerHTML=`<button class="linkbtn kb-ed" type="button" data-kb-rewrite="${t}">Edited · rewrite</button>`}const n=kitCount(t,e.target.value),p=kitPl(t),el=document.querySelector(`[data-kit-n="${t}"]`);if(el){el.textContent=n.toLocaleString('en-GB')+' / '+p.max.toLocaleString('en-GB');el.classList.toggle('so-over',n>p.max)}}});
app.addEventListener('change',e=>{const D=e.target.dataset||{};if(D.kitS)KIT.sizes[D.kitS]=e.target.value;if(D.kitD){KIT.dates=KIT.dates||{};KIT.dates[D.kitD]=e.target.value;if(D.kitD===kitMaster()&&KIT.dateAll)socPaint()}
  if(D.kitWdef!==undefined&&e.target.checked){try{localStorage.setItem('ose-social-where',JSON.stringify(kitWhere()))}catch(_){}toast('Saved as your default: '+kitShown().map(p=>p.n).join(', '));socPaint();return}
  if(D.kitInc){KIT.inc=KIT.inc||{};KIT.inc[D.kitInc]=e.target.checked;const bar=e.target.closest('.kit-bar');if(bar)bar.classList.toggle('off',!e.target.checked);return}
  if(D.kitDall!==undefined){KIT.dateAll=e.target.checked;KIT.dateOv={};socPaint()}});
app.addEventListener('submit',async e=>{const f=e.target.closest('[data-kit-markf]');if(!f)return;e.preventDefault();
  try{await api('socialplansave',{id:f.dataset.kitMarkf,status:'posted',url:f.querySelector('input').value.trim()});KIT.markId=null;await kitPlanLoad();toast('Marked as posted')}catch(err){toast(err.message)}});
app.addEventListener('click',async e=>{
  if(!e.target.closest('#soc'))return;
  const t=e.target.closest('[data-kit-where],[data-kit-tog],[data-kit-expand],[data-kit-ov],[data-kit-ov-off],[data-kit-saveall],[data-kit-all],[data-kitf],[data-kit-open],[data-kit-close],[data-kit-m],[data-kit-dl],[data-kit-copy],[data-kit-copyl],[data-kit-copyh],[data-kit-save],[data-kit-post],[data-kit-mark],[data-kit-undo],[data-kit-del],[data-kit-copyp]');if(!t)return;const D=t.dataset;
  if(D.kitAll!==undefined){KIT.all=true;socPaint();return}
  if(D.kitf){KIT.f=D.kitf;KIT.all=false;socPaint();return}
  if(D.kitOpen!==undefined){KIT.book=D.kitOpen;socPaint();window.scrollTo(0,0);return}
  if(D.kitClose!==undefined){KIT.book=null;socPaint();window.scrollTo(0,0);return}
  if(D.kitM!==undefined){KIT.month=D.kitM==='0'?0:KIT.month+(+D.kitM);socPaint();return}
  const b=bookById(KIT.book);
  if(D.kitDl){t.disabled=true;try{await kitDownload(b,D.kitDl)}catch(err){toast('Couldn’t make the picture')}t.disabled=false;return}
  if(D.kitCopy){copyText(KIT.drafts[b.id][D.kitCopy],kitPl(D.kitCopy).n+' text copied');return}
  if(D.kitCopyl){copyText(kbBooks(b,kbB(b)).length>1?kbSectionLink(kbB(b),D.kitCopyl):kitLink(b,D.kitCopyl),'Link copied');return}
  if(D.kitCopyh!==undefined){copyText(kbTagsNow(b),'Hashtags copied');return}
  if(D.kitCopyp){const x=(KIT.plan||[]).find(y=>y.id===D.kitCopyp);if(x)copyText(x.text||'','Text copied');return}
  if(D.kitWhere){const w=kitWhere(),k=D.kitWhere;KIT.where=w.includes(k)?w.filter(x=>x!==k):kitOrder().filter(x=>x===k||w.includes(x));socPaint();return}
  if(D.kitTog){KIT.open[D.kitTog]=!KIT.open[D.kitTog];if(!KIT.open[D.kitTog])KIT.userClosed=true;socPaint();return}
  if(D.kitExpand!==undefined){kitShown().forEach(p=>KIT.open[p.k]=D.kitExpand==='1');KIT.userClosed=D.kitExpand!=='1';socPaint();return}
  if(D.kitOv){(KIT.dateOv=KIT.dateOv||{})[D.kitOv]=true;KIT.dates=KIT.dates||{};KIT.dates[D.kitOv]=kitDate(kitMaster());socPaint();return}
  if(D.kitOvOff){(KIT.dateOv=KIT.dateOv||{})[D.kitOvOff]=false;socPaint();return}
  const planOne=pl=>api('socialplansave',{platform:pl,date:kitDate(pl),bookId:b.id,text:KIT.drafts[b.id][pl],link:kbBooks(b,kbB(b)).length>1?kbSectionLink(kbB(b),pl):kitLink(b,pl),size:KIT.sizes[pl]||kitPl(pl).size});
  if(D.kitSave){const pl=D.kitSave,dt=kitDate(pl);if(!dt){toast('Choose the date first');const i=document.querySelector(`[data-kit-d="${pl}"]`)||document.querySelector('[data-kit-d="instagram"]');if(i)i.focus();return}
    try{await planOne(pl);KIT.plan=null;kitPlanLoad();toast(`Saved: ${kitPl(pl).n} on ${fmtDate(dt,true)}`)}catch(err){toast(err.message)}return}
  if(D.kitSaveall!==undefined){const ticked=kitShown();const ready=ticked.filter(p=>kitDate(p.k));if(!ticked.length){toast('Tick at least one platform');return}if(!ready.length){toast('Choose the date first');const i=document.querySelector('[data-kit-d]');if(i)i.focus();return}if(ready.length<ticked.length)toast(`${ticked.length-ready.length} ticked platform${ticked.length-ready.length===1?' has':'s have'} no date and ${ticked.length-ready.length===1?'was':'were'} skipped`);t.disabled=true;
    try{for(const p of ready)await planOne(p.k);KIT.plan=null;kitPlanLoad();toast(`Saved ${ready.length} post${ready.length===1?'':'s'} to the calendar`)}catch(err){toast(err.message)}t.disabled=false;return}
  if(D.kitPost){const pl=D.kitPost,size=KIT.sizes[pl]||kitPl(pl).size;if(pl==='instagram'&&size==='story'){toast('Stories can’t be posted from here: choose another size');return}
    t.disabled=true;t.textContent='Preparing the picture…';
    try{const books=kbBooks(b,kbB(b)),many=books.length>1,sz=many?(KIT.slideSize||'portrait'):size,paths=[];
      for(const x of books){const bl=await kitBlob(x,sz,'image/jpeg');const fd=new FormData();fd.append('file',bl,`${x.id}-${sz}.jpg`);paths.push((await api('upload',fd,true)).path)}
      const txt=KIT.drafts[b.id][pl],link=pl==='facebook'&&!many?kitLink(b,'facebook'):'';
      SOC.c=socNew({bookId:b.id,text:txt,igText:txt,same:true,link,image:paths[0],images:many?paths:null,frame:'none',bg:b.tileColor||'#F4F5F4',fb:pl==='facebook',ig:pl==='instagram'});KIT.book=null;socPaint();window.scrollTo(0,0)}
    catch(err){toast(err.message);t.disabled=false;t.textContent='Post to '+kitPl(pl).n+'…'}return}
  if(D.kitMark!==undefined){KIT.markId=D.kitMark||null;socPaint();return}
  if(D.kitUndo){try{await api('socialplansave',{id:D.kitUndo,status:'planned'});await kitPlanLoad()}catch(err){toast(err.message)}return}
  if(D.kitDel){if(t.dataset.sure!=='1'){t.dataset.sure='1';t.textContent='Remove?';return}try{await api('socialplandelete',{id:D.kitDel});await kitPlanLoad()}catch(err){toast(err.message)}return}
});
/* ---- progress for the web searches (they take a minute or two) ---- */
const KB_STAGES={find:['Searching the web…','Reading what it found…','Checking dates and sources…','Writing the suggestions…'],scan:['Reading our courses…','Searching the web for birthdays and anniversaries…','Looking for exhibitions and events…','Checking dates and sources…','Writing the suggestions…']};
KIT.runs=KIT.runs||{};
function kbProg(key,kind){const r=KIT.runs[key];if(!r)return '';return `<div class="kb-prog" data-kb-prog="${esc(key)}" data-kind="${kind}" role="status" aria-live="polite"><div class="kb-bar"><i style="width:${kbPct(r)}%"></i></div><div class="kb-progtxt"><b>${esc(kbStage(r,kind))}</b><span>${kbSecs(r)}</span></div><p class="hint" style="margin:0">This usually takes ${kind==='scan'?'one to two minutes':'up to a minute'}. You can carry on working in Social: the results will be waiting here. Just don’t close or reload the page.</p></div>`}
const kbPct=r=>Math.min(95,Math.round(95*(1-Math.exp(-((Date.now()-r.t)/1000)/(r.est/2.2)))));
const kbStage=(r,kind)=>{const st=KB_STAGES[kind],f=Math.min(.999,((Date.now()-r.t)/1000)/r.est);return st[Math.min(st.length-1,Math.floor(f*st.length))]};
const kbSecs=r=>{const s=Math.round((Date.now()-r.t)/1000);return s<60?s+'s':Math.floor(s/60)+'m '+String(s%60).padStart(2,'0')+'s'};
function kbRunStart(key,est){KIT.runs[key]={t:Date.now(),est};if(!KIT.progTimer)KIT.progTimer=setInterval(()=>{const keys=Object.keys(KIT.runs);if(!keys.length){clearInterval(KIT.progTimer);KIT.progTimer=0;return}
  document.querySelectorAll('[data-kb-prog]').forEach(el=>{const r=KIT.runs[el.dataset.kbProg];if(!r)return;el.querySelector('.kb-bar i').style.width=kbPct(r)+'%';el.querySelector('.kb-progtxt b').textContent=kbStage(r,el.dataset.kind);el.querySelector('.kb-progtxt span').textContent=kbSecs(r)})},500)}
function kbRunEnd(key){delete KIT.runs[key]}
window.addEventListener('beforeunload',e=>{if(Object.keys(KIT.runs||{}).length){e.preventDefault();e.returnValue=''}});
/* ---- post builder: an optional opener (a fact, an exhibition, news) followed by the book or books ---- */
const KB_TYPES=[['book','Just the course'],['fact','Fact or anniversary'],['exhibition','Event or key date'],['new','Space available'],['forthcoming','Next year']];
const KB_EX=[['opening','Starts'],['now','On now'],['closing','Last chance'],['event','Event or webinar'],['announce','Announcement']];
const KB_OPTS=[['buy','“Link in bio” line, before the hashtags (Instagram)'],['summary','Course summary'],['partner','Teacher'],['date','Start date'],['specs','Course details (lessons a week, length, exam board)'],['tags','Hashtags'],['mentions','Mentions (@handles)']];
const kbBooks=(b,B)=>(B.type==='new'||B.type==='forthcoming')?[b,...(B.multi||[]).map(bookById).filter(x=>x&&x.id!==b.id)].slice(0,10):[b];
const KB_TERMS=[ // subject words found in a course's title, topics or summary, and the hashtag each gives
 [/english lit/i,'#EnglishLiterature'],[/english lang/i,'#EnglishLanguage'],[/shakespeare|macbeth|romeo|hamlet|tempest|othello/i,'#Shakespeare'],[/poetry|poems?\b|anthology/i,'#Poetry'],[/creative writing/i,'#CreativeWriting'],
 [/reading|novel|fiction/i,'#Reading'],[/grammar|punctuation|spelling/i,'#Grammar'],[/maths|mathematics|algebra|geometry|fractions/i,'#Maths'],[/statistics/i,'#Statistics'],
 [/biology|cells?\b|ecosystem|genetics/i,'#Biology'],[/chemistry|atoms?\b|periodic|reactions/i,'#Chemistry'],[/physics|forces|energy|electricity|waves/i,'#Physics'],[/science/i,'#Science'],
 [/history|medieval|tudor|victorian|world war|norman|magna carta|black death|cold war/i,'#History'],[/world war/i,'#WW2'],[/geograph|tectonic|volcano|earthquake|rivers?\b|coast|climate/i,'#Geography'],
 [/climate change/i,'#ClimateChange'],[/business|enterprise|entrepreneur|marketing|finance/i,'#Business'],[/media studies|\bmedia\b|film|advertising/i,'#MediaStudies'],[/computer|coding|programming|computing/i,'#Computing'],
 [/psychology/i,'#Psychology'],[/sociology/i,'#Sociology'],[/religio/i,'#RE'],[/french/i,'#French'],[/spanish/i,'#Spanish'],[/art\b|drawing|painting/i,'#Art'],[/music/i,'#Music'],
 [/exam technique|revision|past papers?/i,'#Revision'],[/\bexams?\b/i,'#Exams'],[/private candidate/i,'#PrivateCandidates'],[/sen\b|send\b|dyslexi|autis|adhd/i,'#SEN']];
const KB_ARTISTS=['Shakespeare','Dickens','Austen','Brontë','Orwell','Steinbeck','Priestley','Stevenson','Shelley','Tolkien','Lewis','Dahl','Golding','Ishiguro','Morpurgo','Agatha Christie','Wordsworth','Keats','Owen','Tennyson','Angelou','Zephaniah','Duffy','Armitage','Heaney','Darwin','Newton','Einstein','Curie','Faraday','Hawking','Franklin','Pythagoras','Euclid','Fibonacci','Turing','Lovelace','Babbage','Nightingale','Seacole','Churchill','Elizabeth I','Henry VIII','Victoria','Mandela','Luther King','Pankhurst'];
const kbTag=(s,max)=>{const t=kitTag(s);return t.length>2&&t.length<=(max||32)?t:''};
const kbLooksName=s=>/^(?!The\b|A\b|An\b)[A-ZÀ-Ý][a-zà-ÿ’'.-]+(?: (?:de |van |von |da |di |del |la |le )?[A-ZÀ-Ý][a-zà-ÿ’'.-]+){1,3}$/.test(String(s).trim());
function kitTagsFor(b,B){
  B=B||kbB(b);const books=kbBooks(b,B),multi=books.length>1,t=['#OHSOED','#HomeEducation','#HomeEd'];
  // what the post is about first: the person, the exhibition, the place
  if(B.type==='fact'&&B.fact.person)t.push(kbTag(B.fact.person));
  if(B.type==='exhibition'){t.push(kbTag(B.ex.name.replace(/[“”"]/g,'')),kbTag(B.ex.venue,36),kbTag(B.ex.city))}
  // the course(s): the level and subject, people named in it, subject words
  for(const x of books.slice(0,multi?10:1)){
    if(!multi&&x.kind==='course'){t.push(kbTag(x.title,26));if(x.category)t.push(KIT_LVL[x.category]||kbTag(x.category))}else if(!multi)t.push(kbTag(String(x.title).split(':')[0],26));
    if(x.subject)t.push(kbTag(x.subject));
    const txt=[x.title,x.subtitle,x.summary,(x.topics||[]).join(' ')].join(' ');
    if(!multi){KB_ARTISTS.forEach(a=>{if(new RegExp('\\b'+a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(txt))t.push(kbTag(a))});
      let n=0;for(const [re,tag] of KB_TERMS){if(n<5&&re.test(txt)){t.push(tag);n++}}}
  }
  t.push(B.type==='forthcoming'||(!multi&&b.status==='next')?'#NowEnrolling':b.status==='workshop'?'#Workshop':'','#OnlineSchool',multi?'#Homeschooling':'');
  const seen=new Set();return t.filter(x=>{const k=(x||'').toLowerCase();if(!x||seen.has(k))return false;seen.add(k);return true}).slice(0,20).join(' ')}
const kbTagsNow=(b,B)=>{B=B||kbB(b);return B.tagsEdited?(B.tags||'').trim():kitTagsFor(b,B)};
function kbNew(b){return {type:b.status==='space'?'new':b.status==='next'?'forthcoming':'book',opener:'',openerAuto:true,fact:{person:'',date:'',text:''},ex:{kind:'opening',name:'',venue:'',city:'',starts:'',ends:'',url:'',details:''},multi:[],
  opts:{buy:true,summary:true,partner:true,date:true,specs:false,tags:true,mentions:true},handles:kbHandles((KIT.handles||{})[b.partner||'']).join(' ')}}
const kbPool=(b,B)=>[...state.books].filter(x=>x.status===(B.type==='new'?'space':'next')&&x.id!==b.id); // in the order of the course list
const pool9=(b,B)=>kbPool(b,B).slice(0,9).map(x=>x.id);
const kbHandles=h=>String(h||'').trim().split(/[\s,]+/).filter(x=>x&&!(x.indexOf('@')>0)).map(x=>x[0]==='@'?x:'@'+x); // handles only: anything that looks like an email address is dropped
const kbB=b=>{KIT.bld=KIT.bld||{};if(!KIT.bld[b.id])KIT.bld[b.id]=kbNew(b);return KIT.bld[b.id]};
const kbD=d=>d?fmtDate(d,true):'';
const kbBare=u=>String(u||'').replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,'');
function kbAutoOpener(b,B){
  if(B.type==='fact')return (B.fact.text||'').trim();
  if(B.type!=='exhibition')return '';
  const x=B.ex,name=(x.name||'').trim()||b.title,at=[x.venue,x.city].map(s=>(s||'').trim()).filter(Boolean).join(', '),A=at?` at ${at}`:'';
  const s={opening:`${name} starts${x.starts?' on '+kbD(x.starts):''}${A}${x.ends?', running until '+kbD(x.ends):''}.`,
    now:`On now${A}: ${name}${x.ends?', until '+kbD(x.ends):''}.`,
    closing:`Last chance: ${name}${A}${x.ends?' closes on '+kbD(x.ends):''}.`,
    event:`${name}${A}${x.starts?' on '+kbD(x.starts):''}.`,
    announce:`We’re delighted to announce ${name}${A}${x.starts?', from '+kbD(x.starts):''}.`}[x.kind]||'';
  return [s,(x.details||'').trim(),x.url?`More details: ${kbBare(x.url)}`:''].filter(Boolean).join('\n\n')}
const kbOpener=(b,B)=>(B.openerAuto?kbAutoOpener(b,B):B.opener).trim();
function kbSectionLink(B,pl){const page=B.type==='forthcoming'?'next-year':'space-available';return kitBase()+'courses?utm_source='+pl+'&utm_medium=social&utm_campaign='+page}
function kitBuild(b,pl,B){
  B=B||kbB(b);const O=B.opts,books=kbBooks(b,B),multi=books.length>1,op=kbOpener(b,B),hasOp=!!op&&(B.type==='fact'||B.type==='exhibition'||!!B.opener);
  const L=multi?kbSectionLink(B,pl):kitLink(b,pl),fc=books.every(x=>x.status==='next'),ws=!multi&&b.status==='workshop';
  const T=x=>x.title+(x.subtitle?' ('+x.subtitle+')':''),J=a=>a.filter(Boolean).join('\n\n');
  const sum=x=>{const s=(x.summary||'').trim();return s?s.replace(/([^.!?…])$/,'$1.'):''};
  const when=x=>x.status==='next'&&x.pubDate?kitMonth(x.pubDate):'';
  const wsDate=ws&&b.pubDate?fmtDate(b.pubDate,true):'';
  // the course part
  let lead,body=[];
  if(multi){
    lead=B.type==='forthcoming'?`Now enrolling${when(b)?' for '+when(b):''}: live online courses for home-educated students:`:'Space available on these live online courses:';
    body.push(books.map(x=>`• ${T(x)}${O.partner&&x.partner?', with '+x.partner:''}${O.date&&when(x)&&B.type!=='forthcoming'?' (from '+when(x)+')':''}`).join('\n'));
    if(pl==='instagram'||pl==='facebook')body.push(pl==='instagram'?'Swipe through to see them all.':'');
  }else{
    const p=O.partner&&b.partner?b.partner:'';
    if(hasOp)lead=ws?`Join our workshop “${T(b)}”${wsDate?' on '+wsDate:''}.`:`Find out more in our ${T(b)} course${p?', taught by '+p:''}.`;
    else lead=ws?`New workshop: ${T(b)}${wsDate?', '+wsDate:''}`:B.type==='forthcoming'||(B.type==='book'&&b.status==='next')?`Now enrolling${when(b)?' for '+when(b):''}: ${T(b)}`:B.type==='new'||(B.type==='book'&&b.status==='space')?`Space available: ${T(b)}`:T(b);
    if(O.summary&&sum(b))body.push(sum(b));
    if(p&&!hasOp)body.push(`Taught by ${p}.`);
    if(O.specs&&kitSpec(b))body.push(kitSpec(b));
    if(O.date&&b.status==='next'&&b.pubDate)body.push(`Starts ${kitMonth(b.pubDate)}. Places are open now.`);
  }
  const tags=O.tags?kbTagsNow(b,B):'';
  const men=O.mentions?kbHandles(B.handles).join(' '):'';
  const buy=O.buy?(fc?'To enrol, visit the link in our bio.':multi?'To book a place, visit the link in our bio.':ws?'To book your place, visit the link in our bio.':'To book a place or a free taster, visit the link in our bio.'):'';
  // every draft is fitted to its platform's limit: the least important parts go first, then sentences are trimmed
  const max=kitPl(pl).max,P=(t,pri,kind,alts)=>({t:t||'',pri,kind:kind||'',alts:alts||null});
  const LA=multi?null:hasOp?[ws?`Join our workshop “${b.title}”.`:`Find out more in our ${b.title} course.`]:[lead.replace(T(b),b.title)].filter(x=>x!==lead);
  const sumP=body.map(t=>P(t,t===sum(b)?3:t.startsWith('•')?5:t.startsWith('Taught by')?2:t===kitSpec(b)?1:2,t===sum(b)?'sent':t.startsWith('•')?'lines':''));
  let parts;
  if(pl==='instagram')parts=[P(hasOp?op:'',7,'sent'),P(lead,8,'cut',LA),...sumP,P(men,3),P(buy,6),P(tags,4,'words')]; // the “link in bio” line comes last, just before the hashtags
  else if(pl==='facebook')parts=[P(hasOp?op:'',7,'sent'),P(lead,8,'cut',LA),...sumP,P(men,3),P((fc?'Enrol now: ':ws?'Book your place: ':'Find out more: ')+L,9)];
  else if(pl==='linkedin')parts=[P(hasOp?op:'',7,'sent'),P(lead,8,'cut',LA),...sumP,P(L,9),P(tags.split(' ').slice(0,3).join(' '),4,'words')];
  else if(pl==='threads')parts=[P(hasOp?op:'',7,'sent'),P(lead,8,'cut',LA),...(multi?sumP:sumP.slice(0,1)),P(men,3),P(L,9)];
  else parts=[P(hasOp?op:'',7,'sent'),P(multi?lead+' '+books.map(x=>x.title).join(', '):lead,8,'cut',LA),P(L,9)]; // X and Bluesky: short
  return kbFit(parts,max,pl)}
function kbFit(parts,max,pl){
  const J=()=>parts.map(p=>p.t).filter(Boolean).join(pl==='x'||pl==='bluesky'?'\n\n':'\n\n'),n=t=>kitCount(pl,t);
  for(let guard=0;guard<300;guard++){
    const text=J();if(n(text)<=max)return text;
    const c=parts.filter(p=>p.t&&p.pri<9).sort((a,b)=>a.pri-b.pri)[0];if(!c)return text;
    const sents=c.kind==='sent'?c.t.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g)||[c.t]:null;
    if(sents&&sents.length>1&&c.pri>=7){const alt=parts.find(p=>p.alts&&p.alts.length);if(alt){alt.t=alt.alts.shift();continue}} // keep more of the opener: shorten the book line first
    if(sents&&sents.length>1){c.t=sents.slice(0,-1).join('').trim();continue}
    if(c.kind==='words'&&c.t.split(' ').length>2){c.t=c.t.split(' ').slice(0,-1).join(' ');continue}
    if(c.kind==='lines'&&c.t.split('\n').length>2){c.t=c.t.split('\n').slice(0,-1).join('\n');continue}
    const alt=parts.find(p=>p.alts&&p.alts.length);if(c.pri>=7&&alt){alt.t=alt.alts.shift();continue} // a shorter book line before cutting the opener or the lead
    if(c.pri>=7){ // the lead or the opener: shorten it to the room left, at a word
      const room=max-(n(text)-n(c.t))-1;if(room<40){c.t='';c.pri=0;continue}
      c.t=c.t.slice(0,room).replace(/\s+\S*$/,'').replace(/[,;:\s]+$/,'')+'…';c.pri=0;continue}
    c.t=''}
  return J()}
function kbRedraft(b,all){KIT.edited=KIT.edited||{};const E=KIT.edited[b.id]||{};KIT.drafts[b.id]=KIT.drafts[b.id]||{};
  KIT_PL.forEach(p=>{if(all||!E[p.k]){KIT.drafts[b.id][p.k]=kitBuild(b,p.k);const ta=document.querySelector(`[data-kit-t="${p.k}"]`);if(ta&&ta.value!==KIT.drafts[b.id][p.k]){ta.value=KIT.drafts[b.id][p.k];ta.dispatchEvent(new Event('kb-count'))}}});
  if(all)KIT.edited[b.id]={}}
function kbCountPaint(pl){const ta=document.querySelector(`[data-kit-t="${pl}"]`);const v=ta?ta.value:((KIT.drafts||{})[KIT.book]||{})[pl]||'';const n=kitCount(pl,v),p=kitPl(pl),el=document.querySelector(`[data-kit-n="${pl}"]`);if(el){el.textContent=n.toLocaleString('en-GB')+' / '+p.max.toLocaleString('en-GB');el.classList.toggle('so-over',n>p.max)}}
function kbFindList(b){const F=(KIT.find||{})[b.id];if(!F)return '';
  if(F.loading)return kbProg('find:'+b.id,'find');
  if(F.err)return `<p class="hint" style="color:#8A2F10">${esc(F.err)}</p>`;
  if(!F.items.length)return '<p class="hint">Nothing reliable found this time. Try the other search, or write the opener yourself.</p>';
  return `<div class="kb-sugs">${F.items.map((s,i)=>`<div class="kb-sug"><div><span class="pill">${esc(s.kind)}</span> ${s.date?`<span class="mono">${esc(kbD(s.date))}</span>`:''} <b>${esc(s.title)}</b></div><p>${esc(s.opener)}</p><div class="so-row">${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener" class="hint">Source: ${esc(kbBare(s.url).split('/')[0])}</a>`:''}<button class="btn small" type="button" data-kb-use="${i}" style="margin-left:auto">Use this</button></div></div>`).join('')}</div>`}
function kbUse(b,s){const B=kbB(b);const ex=s.kind==='exhibition'||s.kind==='event';
  B.type=ex?'exhibition':'fact';
  if(ex){Object.assign(B.ex,{kind:s.kind==='event'?'event':(s.starts&&s.starts>new Date().toISOString().slice(0,10)?'opening':'now'),name:s.title||'',venue:s.venue||'',city:s.city||'',starts:s.starts||s.date||'',ends:s.ends||'',url:s.url||''})}
  else{Object.assign(B.fact,{person:s.person||'',date:s.date||'',text:s.opener||''})}
  B.opener=s.opener||'';B.openerAuto=!ex;kbRedraft(b)}
function kbCard(b){
  const B=kbB(b),O=B.opts,ai=!!KIT.ai;
  const chip=(k,l,cur,attr)=>`<button type="button" class="cms-chip" ${attr}="${k}" aria-pressed="${cur===k}">${l}</button>`;
  const inp=(path,l,type,ph)=>{const [g,k]=path.split('.');const v=k?B[g][k]:B[g];return `<div class="field"><label>${l}</label><input type="${type||'text'}" data-kb="${path}" value="${esc(v||'')}"${ph?` placeholder="${esc(ph)}"`:''}></div>`};
  const pool=B.type==='new'||B.type==='forthcoming'?kbPool(b,B):[];
  const busy=!!KIT.runs['find:'+b.id];const findBtn=k=>`<button class="btn small" type="button" data-kb-find="${k}"${ai&&!busy?'':' disabled'}>${busy?'Searching…':(k==='exhibition'?'Find events and key dates':'Find facts and anniversaries')+' with AI'}</button>${ai?'':'<span class="hint">To search the web, add the Anthropic API key under Connect to Social › AI searches.</span>'}`;
  let fields='';
  if(B.type==='fact')fields=`<div class="kb-row">${inp('fact.person','Person or subject','text',b.subject||b.title)}${inp('fact.date','Date (optional)','date')}</div>
    <div class="field"><label>The fact or anniversary <span class="hint">(opens the post)</span></label><textarea rows="4" data-kb="fact.text" placeholder="e.g. On this day in 1616, William Shakespeare died. 410 years on, his plays are still on every GCSE English syllabus.">${esc(B.fact.text)}</textarea></div><div class="so-row">${findBtn('fact')}</div>${kbFindList(b)}`;
  if(B.type==='exhibition')fields=`<div class="field"><span class="em-lbl">What’s happening</span><div class="cms-filters" style="margin:0">${KB_EX.map(([k,l])=>chip(k,l,B.ex.kind,'data-kb-exk')).join('')}</div></div>
    <div class="kb-row">${inp('ex.name','Event or date','text','e.g. World Book Day, GCSE results day')}${inp('ex.venue','Where (optional)','text','e.g. online')}${inp('ex.city','Town or city (optional)')}</div>
    <div class="kb-row">${inp('ex.starts',B.ex.kind==='event'?'Date':'Starts','date')}${B.ex.kind==='event'?'':inp('ex.ends',B.ex.kind==='closing'?'Deadline':'Ends','date')}${inp('ex.url','Link for more details','url','https://')}</div>
    <div class="field"><label>More details (optional)</label><textarea rows="3" data-kb="ex.details">${esc(B.ex.details)}</textarea></div><div class="so-row">${findBtn('exhibition')}</div>${kbFindList(b)}
    <div class="field"><label class="check"><input type="checkbox" data-kb-auto${B.openerAuto?' checked':''}> Write the opener from these details</label>${B.openerAuto?`<p class="kb-auto">${esc(kbAutoOpener(b,B)).replace(/\n/g,'<br>')||'<span class="hint">Fill in the details above.</span>'}</p>`:`<textarea rows="4" data-kb="opener">${esc(B.opener)}</textarea>`}</div>`;
  if(B.type==='book'||B.type==='new'||B.type==='forthcoming')fields=`<div class="field"><label>Opening line (optional) <span class="hint">: news, a quote, a season, anything that leads into the course</span></label><textarea rows="3" data-kb="opener">${esc(B.opener)}</textarea></div>`
    +(pool.length?`<div class="field"><span class="em-lbl kb-sshead">Slideshow <span class="hint">: add more ${B.type==='new'?'courses with space':'next year’s courses'} (up to 10 in all)</span><label class="check"><input type="checkbox" data-kb-all${pool.slice(0,9).every(x=>B.multi.includes(x.id))?' checked':''}> Select all${pool.length>9?' (the first 9)':''}</label></span><div class="kb-multi">${pool.slice(0,30).map(x=>`<label class="check"><input type="checkbox" data-kb-multi="${esc(x.id)}"${B.multi.includes(x.id)?' checked':''}${!B.multi.includes(x.id)&&B.multi.length>=9?' disabled':''}> ${esc(x.title)}${x.partner?` <span class="hint">${esc(x.partner)}</span>`:''}</label>`).join('')}</div></div>`:'');
  return `<div class="em-card kb"><p class="hint" style="margin:0">Choose what the post is about. The pictures and the drafts for each platform below follow these choices.</p>
    <div class="cms-filters" style="margin:0">${KB_TYPES.map(([k,l])=>chip(k,l,B.type,'data-kb-type')).join('')}</div>
    ${fields}
    <div class="field"><span class="em-lbl">Include</span><div class="kb-opts">${KB_OPTS.map(([k,l])=>`<label class="check"><input type="checkbox" data-kb-opt="${k}"${O[k]?' checked':''}> ${l}</label>`).join('')}</div></div>
    ${O.tags?`<div class="field"><label>Hashtags <span class="hint">(made from the person, the event, the level and the subject${B.tagsEdited?'; edited':''})</span>${B.tagsEdited?' <button class="linkbtn" type="button" data-kb-tagreset>Back to the suggested ones</button>':''}</label><textarea rows="2" data-kb="tags">${esc(kbTagsNow(b,B))}</textarea></div>`:''}
    ${O.mentions?`<div class="field"><label>Mentions <span class="hint">(Instagram handles${b.partner?`, remembered for ${esc(b.partner)}`:''})</span></label><input type="text" data-kb="handles" name="ose-mentions" autocomplete="off" data-lpignore="true" data-1p-ignore value="${esc(B.handles)}" placeholder="@partner @teacher"></div>`:''}
  </div>`}
function kbSlides(b){const B=kbB(b),books=kbBooks(b,B);if(books.length<2)return '';
  const size=KIT.slideSize||'portrait';
  setTimeout(async()=>{for(const x of books){const k=x.id+'/'+size,el=document.querySelector(`[data-kb-slide="${x.id}"]`);if(!el)continue;if(!KIT.pics[k]){try{const cv=await kitRender(x,size);KIT.pics[k]=cv.toDataURL('image/jpeg',.85)}catch(_){}}if(el)el.src=KIT.pics[k]||''}});
  return `<div class="em-card kit-pics"><div class="kit-ph"><h2 class="em-h" style="margin:0">Slideshow</h2><span class="so-row"><select data-kb-ssize aria-label="Slide size">${['square','portrait'].map(k=>`<option value="${k}"${size===k?' selected':''}>${KIT_SIZES[k].n}</option>`).join('')}</select><button class="btn small" type="button" data-kb-dlall>Download all ${books.length}</button></span></div>
    <p class="hint" style="margin:0">One picture per course, in this order, for an Instagram or Facebook carousel.</p><div class="kb-slides">${books.map((x,i)=>`<figure><div class="kit-picbox" style="aspect-ratio:${KIT_SIZES[size].w}/${KIT_SIZES[size].h}"><img data-kb-slide="${esc(x.id)}" alt="Slide ${i+1}: ${esc(x.title)}"></div><figcaption>${i+1}. ${esc(x.title)}</figcaption></figure>`).join('')}</div></div>`}
function kbWeekly(){const M=KIT.moments||{},on=M.auto!==false,rc=M.recipients||[],next=M.lastAuto?new Date(Date.parse(M.lastAuto)+7*864e5):M.scannedAt?new Date(Date.parse(M.scannedAt)+7*864e5):null;
  return `<div class="kb-week"><label class="check"><input type="checkbox" data-kb-auto-week${on?' checked':''}> Update the list every week and email a report</label>
    ${on?`<p class="hint" style="margin:0">${next?`Next update: around ${esc(fmtDate(next.toISOString().slice(0,10),true))}, on the first visit to the admin after that.`:'The first weekly update runs a week after the first look.'}</p>
    <div class="field"><label for="kbEmails">Send the report to</label><input id="kbEmails" type="text" value="${esc((M.emails||[]).join(', '))}" placeholder="${esc(rc.join(', ')||'every admin')}"><span class="hint">Leave empty to send it to every admin${rc.length&&!(M.emails||[]).length?` (${esc(rc.join(', '))})`:''}.</span></div>
    <div class="so-row"><button class="btn small" type="button" data-kb-wsave>Save</button><button class="linkbtn" type="button" data-kb-wtest>Send me a test email</button></div>`:''}</div>`}
function kbMomItems(){const M=KIT.moments;return (M&&M.items||[]).filter(x=>bookById(x.bookId))}
function kbMomBtn(){const n=kbMomItems().length;return `<button class="btn small kb-mombtn" type="button" data-kb-drawer aria-expanded="${!!SOC.drawer}">Upcoming moments${KIT.scanning?' <span class="spin"></span>':n?` <span class="kb-n">${n}</span>`:''}</button>`}
function kbMoments(){ // a drawer on the right: timely hooks found on the web
  const M=KIT.moments,ai=!!KIT.ai,its=kbMomItems(),first=!(M&&M.scannedAt);
  return `<aside class="kb-drawer" role="dialog" aria-label="Upcoming moments"><div class="kb-dhead"><b>Upcoming moments</b><button class="so-x" type="button" data-kb-drawer aria-label="Close">×</button></div>
    <div class="kb-dbody"><div class="so-row"><button class="btn ${first?'solid ':''}small" type="button" data-kb-scan${ai&&!KIT.scanning?'':' disabled'}>${KIT.scanning?'Searching…':first?'Look for moments':'Update the list'}</button>${M&&M.scannedAt?`<span class="hint">Last updated ${esc(fmtStamp(M.scannedAt))}</span>`:''}</div>
    <p class="hint" style="margin:0">Claude searches the web for birthdays, anniversaries, awareness days and exam dates in the next eight weeks linked to our courses and workshops, and checks each one. ${ai?'It takes a minute or two and uses a little of the Anthropic API credit.':'Add the Anthropic API key under Connect to Social › AI searches to switch this on.'}</p>
    ${KIT.scanning?kbProg('scan','scan'):''}
    ${kbWeekly()}
    ${its.length?`<div class="kb-sugs">${its.map(s=>{const bk=bookById(s.bookId);return `<div class="kb-sug"><div class="kb-sugtop">${s.date?`<span class="mono">${esc(kbD(s.date))}</span>`:''}<span class="pill">${esc(s.kind)}</span>${s.addedAt&&Date.now()-Date.parse(s.addedAt)<7*864e5?'<span class="pill new">New</span>':''}</div><b>${esc(s.title)}</b><p>${esc(s.opener)}</p><div class="so-row"><span class="hint">For: ${esc(bk.title)}</span>${s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener" class="hint">Source</a>`:''}</div><div class="so-row"><button class="btn solid small" type="button" data-kb-mom="${esc(s.id)}">Make a post</button><button class="linkbtn" type="button" data-kb-dismiss="${esc(s.id)}">Dismiss</button></div></div>`}).join('')}</div>`:(!KIT.scanning&&M?'<p class="hint">Nothing to show. Update the list in a few days.</p>':'')}
  </div></aside>`}
app.addEventListener('input',e=>{const D=e.target.dataset||{};if(D.kb===undefined)return;const b=bookById(KIT.book);if(!b)return;const B=kbB(b);const [g,k]=D.kb.split('.');
  if(k)B[g][k]=e.target.value;else B[g]=e.target.value;
  if(D.kb==='opener'&&B.type==='exhibition')B.openerAuto=false;
  if(D.kb==='tags')B.tagsEdited=true;else if(!B.tagsEdited){const tt=document.querySelector('[data-kb="tags"]');if(tt)tt.value=kitTagsFor(b,B)}
  const au=document.querySelector('.kb-auto');if(au&&B.openerAuto)au.innerHTML=esc(kbAutoOpener(b,B)).replace(/\n/g,'<br>')||'<span class="hint">Fill in the details above.</span>';
  kbRedraft(b);KIT_PL.forEach(p=>kbCountPaint(p.k))});
app.addEventListener('change',async e=>{const D=e.target.dataset||{};
  if(D.kb==='handles'){const b=bookById(KIT.book);if(b&&b.partner){KIT.handles=KIT.handles||{};KIT.handles[b.partner]=e.target.value.trim();try{await api('socialhandle',{partner:b.partner,handles:e.target.value})}catch(_){}}return}
  if(D.kbSsize!==undefined){KIT.slideSize=e.target.value;socPaint();return}
  if(D.kbAutoWeek!==undefined){try{KIT.moments=Object.assign(KIT.moments||{},await api('socialmomentsettings',{auto:e.target.checked}));toast(e.target.checked?'Weekly report switched on':'Weekly report switched off')}catch(err){toast(err.message)}socPaint();return}
  const b=bookById(KIT.book);if(!b)return;const B=kbB(b);
  if(D.kbOpt){B.opts[D.kbOpt]=e.target.checked;kbRedraft(b);socPaint();return}
  if(D.kbAll!==undefined){B.multi=e.target.checked?pool9(b,B):[];kbRedraft(b);socPaint();return}
  if(D.kbMulti){const id=D.kbMulti;B.multi=e.target.checked?[...B.multi.filter(x=>x!==id),id].slice(0,9):B.multi.filter(x=>x!==id);kbRedraft(b);socPaint();return}
  if(D.kbAuto!==undefined){B.openerAuto=e.target.checked;if(!B.openerAuto&&!B.opener)B.opener=kbAutoOpener(b,B);kbRedraft(b);socPaint();return}});
app.addEventListener('click',async e=>{if(!e.target.closest('#soc'))return;if(e.target.closest('[data-kb-drawer]')){SOC.drawer=!SOC.drawer;socPaint();return}
  const t=e.target.closest('[data-kb-wsave],[data-kb-wtest],[data-kb-tagreset],[data-kb-type],[data-kb-exk],[data-kb-find],[data-kb-use],[data-kb-scan],[data-kb-mom],[data-kb-dismiss],[data-kb-dlall],[data-kb-rewrite]');if(!t)return;const D=t.dataset;
  if(D.kbWsave!==undefined){t.disabled=true;try{KIT.moments=Object.assign(KIT.moments||{},await api('socialmomentsettings',{emails:document.getElementById('kbEmails').value}));toast('Saved')}catch(err){toast(err.message)}t.disabled=false;socPaint();return}
  if(D.kbWtest!==undefined){t.disabled=true;t.textContent='Sending…';try{const r=await api('socialmomenttest',{});toast('Test email sent to '+r.to)}catch(err){toast(err.message)}t.disabled=false;t.textContent='Send me a test email';return}
  if(D.kbScan!==undefined){if(KIT.scanning)return;KIT.scanning=true;kbRunStart('scan',100);socPaint();try{KIT.moments=await api('socialscan',{});toast(KIT.moments.added?`Added ${KIT.moments.added} new moment${KIT.moments.added===1?'':'s'}`:'No new moments this time')}catch(err){toast(err.message)}KIT.scanning=false;kbRunEnd('scan');socPaint();return}
  if(D.kbDismiss){try{await api('socialmomentdismiss',{id:D.kbDismiss});KIT.moments.items=KIT.moments.items.filter(x=>x.id!==D.kbDismiss);socPaint()}catch(err){toast(err.message)}return}
  if(D.kbMom){const s=(KIT.moments.items||[]).find(x=>x.id===D.kbMom);const b=s&&bookById(s.bookId);if(!b)return;KIT.book=b.id;kbB(b);kbUse(b,s);SOC.drawer=false;socPaint();window.scrollTo(0,0);return}
  const b=bookById(KIT.book);if(!b)return;const B=kbB(b);
  if(D.kbTagreset!==undefined){B.tagsEdited=false;B.tags='';kbRedraft(b);socPaint();return}
  if(D.kbType){B.type=D.kbType;kbRedraft(b);socPaint();return}
  if(D.kbExk){B.ex.kind=D.kbExk;kbRedraft(b);socPaint();return}
  if(D.kbRewrite){KIT.edited=KIT.edited||{};(KIT.edited[b.id]=KIT.edited[b.id]||{})[D.kbRewrite]=false;kbRedraft(b);socPaint();return}
  if(D.kbFind){if(KIT.runs['find:'+b.id])return;KIT.find=KIT.find||{};KIT.find[b.id]={loading:true};kbRunStart('find:'+b.id,45);socPaint();try{const r=await api('socialfind',{bookId:b.id,kind:D.kbFind});KIT.find[b.id]={items:r.suggestions||[]};toast(`Found ${KIT.find[b.id].items.length} suggestion${KIT.find[b.id].items.length===1?'':'s'} for ${b.title}`)}catch(err){KIT.find[b.id]={err:err.message,items:[]}}kbRunEnd('find:'+b.id);socPaint();return}
  if(D.kbUse!==undefined){const s=((KIT.find||{})[b.id]||{}).items[+D.kbUse];if(s){kbUse(b,s);socPaint()}return}
  if(D.kbDlall!==undefined){t.disabled=true;const size=KIT.slideSize||'portrait';const books=kbBooks(b,B);for(let i=0;i<books.length;i++){try{const bl=await kitBlob(books[i],size,'image/png');const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download=`ohsoed-slide-${i+1}-${books[i].id}-${size}.png`;document.body.appendChild(a);a.click();a.remove();await new Promise(r=>setTimeout(r,400))}catch(_){}}t.disabled=false;return}
});

app._soc={kitBuild,kitCount,KIT_PL,kbB,kbNew,state}; // for the draft-length checks
socBoot();
app.innerHTML=socView();
}
