import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Add your Supabase project URL and anon/publishable key in config.js.
// Never put a service-role key in a browser app.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { renderAdmin, handleAdminClick, initAdmin, resetAdminView } from './admin.js';

const supabaseReady = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const localBooks = [
 {id:'asha',title:"I'm Asha",genre:'Drama',status:'ongoing',chapters_count:18,cover_path:'assets/asha-cover.png',description:'A story of love, choices, and the secrets that refuse to stay buried.',sample:'I had always believed that the truth would set me free. Nobody told me that sometimes, the truth arrives carrying a price I am not ready to pay.'},
 {id:'crush',title:'I Have a Crush on My Bestfriend',genre:'Romance',status:'completed',chapters_count:24,cover_path:'assets/crush-cover.jpeg',description:'What happens when the one person you cannot afford to lose is the one person you cannot stop loving?',sample:'I could handle his jokes, his late-night calls, and the way he knew exactly how I took my coffee. What I could not handle was the way my heart reacted whenever he called me his best friend.'},
 {id:'entanglement',title:'The Entanglement',genre:'Romance',status:'completed',chapters_count:32,cover_path:'assets/entanglement-cover.jpeg',description:'Three people. Complicated feelings. One tangled web of choices and consequences.',sample:'If love was supposed to be simple, nobody had told the three of us. We had turned a beautiful friendship into a maze, and every exit led back to somebody getting hurt.'},
 {id:'muse',title:'My Muse',genre:'Romance',status:'completed',chapters_count:20,cover_path:'assets/muse-cover.jpeg',description:'Sometimes the person who inspires your greatest work becomes your most complicated story.',sample:'He looked at me like I was a masterpiece. I was beginning to suspect that he had only seen the parts of me I knew how to hide.'},
 {id:'rich',title:'The Rich Girlfriend',genre:'Romance',status:'completed',chapters_count:28,cover_path:'assets/rich-girlfriend-cover.jpeg',description:'Money can open doors. It cannot tell you who is waiting on the other side.',sample:'People thought being rich meant having everything. I had the wardrobe, the invitations, and the perfect photographs. What I wanted was the one thing money could not buy: somebody who chose me without knowing my surname.'},
 {id:'shadows',title:'Shadows After Egos',genre:'Drama',status:'completed',chapters_count:16,cover_path:'assets/shadows-cover.png',description:'Behind every proud heart is a truth it is terrified to reveal.',sample:'We were both too proud to apologise, too hurt to forget, and too in love to walk away. The silence between us became its own kind of language.'}
];
const lsGet=(k,fallback)=>{try{const v=localStorage.getItem(k);return v===null?fallback:JSON.parse(v)}catch{return fallback}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
// Progress entries are {pct, ch (chapter number), chId, at (ms timestamp)}. Older saves stored a bare percentage.
const normProgress=p=>Object.fromEntries(Object.entries(p||{}).map(([k,v])=>[k,typeof v==='number'?{pct:v,ch:1,chId:null,at:0}:v]));
const isDb=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));

let books=supabase?[]:[...localBooks],page='Home',selected=supabase?null:'crush',filter='All',query='',fontSize=19,readChapter=1,user=null,profile=null,recovering=false,replyTo=null,readerState=null,renderId=0,chapterCache={},editingNews=null,returnTo=null;
// Passage comments: the current chapter's comments, where their passages sit, the passage being commented on, and the passage the list is filtered to.
let chapterComments=[],passageRanges=[],passageDraft=null,pendingPassage=null,focusIds=null;
let saved=lsGet('dc_saved',supabase?[]:['crush']),progress=normProgress(lsGet('dc_progress',supabase?{}:{crush:38}));
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>profile?.role==='admin';
const ago=d=>{const s=(Date.now()-new Date(d))/1000;if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;if(s<604800)return`${Math.floor(s/86400)}d ago`;return new Date(d).toLocaleDateString()};
const authorName=b=>b.author?.display_name||(isDb(b.id)?'Dionce Creativity':'Dionetta Ekwe');
const findBook=id=>books.find(x=>String(x.id)===String(id));
function toast(s){$('toast').textContent=s;$('toast').classList.remove('hide');clearTimeout(window._toast);window._toast=setTimeout(()=>$('toast').classList.add('hide'),3000)}
function img(b,cls='cover'){let path=b.cover_url||b.cover_path||'assets/dc-logo.jpg';return `<img class="${cls}" src="${esc(path)}" alt="Cover of ${esc(b.title)}" loading="lazy" onerror="this.style.background='#ead9ef';this.alt='Cover unavailable'">`}
// Reading stats: compact numbers (1.2K, 21.3M) with small line icons, as on Wattpad.
const fmt=n=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(n)||0);
const svg=d=>`<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON={reads:svg('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),parts:svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),comments:svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')};
const stat=(kind,n,label,id='')=>`<span title="${fmt(n)} ${label}" aria-label="${Number(n)||0} ${label}"${id?` id="${id}"`:''}>${ICON[kind]}${fmt(n)}</span>`;
function card(b){return `<button class="book" data-open="${esc(b.id)}">${img(b)}<div class="bookname">${esc(b.title)}</div><div class="meta">${esc(b.genre)} · ${b.chapters_count||0} chapters</div>${b.reads_count!==undefined?`<div class="stats" style="margin-top:3px">${stat('reads',b.reads_count,'reads')}</div>`:''}</button>`}
function head(title,sub=''){return `<div class="eyebrow">DIONCE CREATIVITY</div><h1 class="title">${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}`}
function updateNav(){document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));document.querySelector('.sidebar [data-page="Admin"]').classList.toggle('hide',!isAdmin());document.querySelector('.avatar').textContent=(profile?.display_name||user?.email||'D').trim().charAt(0).toUpperCase()}

// ---------- Data loading ----------
async function loadBooks(){
 if(!supabase)return;
 const cols='id,title,slug,description,genre,status,cover_url,chapters_count,created_at';
 let {data,error}=await supabase.from('books').select(`${cols},reads_count,author:profiles!books_author_profile_fk(display_name)`).eq('is_published',true).order('created_at',{ascending:false});
 // Before 002_mvp_features.sql has run there is no author link; load the books without bylines.
 if(error)({data,error}=await supabase.from('books').select(cols).eq('is_published',true).order('created_at',{ascending:false}));
 if(error){console.warn('Could not load published books:',error.message);toast('Could not load stories right now.')}
 books=data||[];chapterCache={};
 if(selected&&!findBook(selected))selected=null;
}
async function loadUser(){
 if(!supabase)return;
 const {data}=await supabase.auth.getUser();user=data?.user||null;profile=null;
 if(user){const {data:p}=await supabase.from('profiles').select('display_name,role').eq('id',user.id).maybeSingle();profile=p;await syncLibrary()}
}
// Merge this browser's library and reading progress into the account, then use the account's copy.
async function syncLibrary(){
 const [{data:s,error:e1},{data:p,error:e2}]=await Promise.all([
  supabase.from('library_saves').select('book_id').eq('user_id',user.id),
  supabase.from('reading_progress').select('book_id,chapter_id,progress_percent,updated_at,chapters(chapter_number)').eq('user_id',user.id)
 ]);
 if(e1||e2){console.warn('Could not sync library:',(e1||e2).message);return}
 const serverSaved=new Set((s||[]).map(r=>r.book_id)),serverProgress={};
 for(const r of p||[])serverProgress[r.book_id]={pct:r.progress_percent,ch:r.chapters?.chapter_number||1,chId:r.chapter_id,at:new Date(r.updated_at).getTime()};
 const newSaves=saved.filter(id=>isDb(id)&&!serverSaved.has(id)).map(book_id=>({user_id:user.id,book_id}));
 const newProgress=Object.entries(progress).filter(([id,v])=>isDb(id)&&v.at>(serverProgress[id]?.at||0)).map(([book_id,v])=>({user_id:user.id,book_id,chapter_id:v.chId,progress_percent:v.pct,updated_at:new Date(v.at).toISOString()}));
 if(newSaves.length)await supabase.from('library_saves').upsert(newSaves,{ignoreDuplicates:true});
 if(newProgress.length)await supabase.from('reading_progress').upsert(newProgress);
 newSaves.forEach(r=>serverSaved.add(r.book_id));
 newProgress.forEach(r=>serverProgress[r.book_id]=progress[r.book_id]);
 saved=[...serverSaved];progress=serverProgress;
 lsSet('dc_saved',saved);lsSet('dc_progress',progress);
}
async function toggleSave(id){
 const on=!saved.includes(String(id));
 saved=on?[...saved,String(id)]:saved.filter(x=>x!==String(id));lsSet('dc_saved',saved);
 if(user&&isDb(id)){const q=supabase.from('library_saves');const {error}=on?await q.upsert({user_id:user.id,book_id:id},{ignoreDuplicates:true}):await q.delete().eq('user_id',user.id).eq('book_id',id);if(error)toast(error.message)}
}
function setProgress(b,entry,index,total){
 const v={pct:Math.round((index+1)/Math.max(total,1)*100),ch:entry.chapter_number,chId:isDb(entry.id)?entry.id:null,at:Date.now()};
 progress[b.id]=v;lsSet('dc_progress',progress);
 if(user&&isDb(b.id))supabase.from('reading_progress').upsert({user_id:user.id,book_id:b.id,chapter_id:v.chId,progress_percent:v.pct,updated_at:new Date(v.at).toISOString()}).then(({error})=>error&&console.warn('Progress not saved:',error.message));
}
// Published chapter list for readers (number, title, is_free). Demo books get generated entries.
// chapter_index lists every published chapter, even ones a signed-out reader can't open yet.
async function getChapters(b){
 if(chapterCache[b.id])return chapterCache[b.id];
 let list;
 if(supabase&&isDb(b.id)){
  let {data,error}=await supabase.from('chapter_index').select('id,chapter_number,title,is_free,reads_count,comments_count').eq('book_id',b.id).order('chapter_number');
  // Before 005_reading_stats.sql has run the view has no counts.
  if(error)({data,error}=await supabase.from('chapter_index').select('id,chapter_number,title,is_free').eq('book_id',b.id).order('chapter_number'));
  // Before 004_signin_to_read.sql has run there is no chapter_index view.
  if(error)({data,error}=await supabase.from('chapters').select('id,chapter_number,title').eq('book_id',b.id).eq('is_published',true).order('chapter_number'));
  if(error)toast(error.message);list=data||[];
 }
 else list=Array.from({length:Number(b.chapters_count)||1},(_,i)=>({id:`demo-${b.id}-${i+1}`,chapter_number:i+1,title:`Chapter ${i+1}`}));
 return chapterCache[b.id]=list;
}
// Chapters past the free ones need a signed-in reader (the database enforces this too).
const isLocked=c=>!!supabase&&!user&&c.is_free===false;
async function getChapterBody(b,entry){
 if(supabase&&isDb(entry.id)){const {data}=await supabase.from('chapters').select('title,body').eq('id',entry.id).maybeSingle();return data||{title:entry.title,body:''}}
 return {title:entry.title,body:`${b.sample||b.description||'Every story begins somewhere.'}\n\nShe took a breath, trying to make sense of the thoughts tumbling through her mind. The truth had a way of arriving at the worst possible moment, and this was no exception.\n\nMaybe the hardest part was not knowing what would happen next. It was knowing that whatever happened, nothing would ever be quite the same again.\n\nOutside, the world carried on as if nothing had changed. Inside, a new chapter had already begun.`};
}
const chapterLabel=(n,title)=>!title||title===`Chapter ${n}`?`Chapter ${n}`:`Chapter ${n}: ${esc(title)}`;

// ---------- Comment and discussion threads (one level of replies) ----------
function thread(rows,kind){
 const top=rows.filter(r=>!r.parent_id),replies={};
 rows.filter(r=>r.parent_id).forEach(r=>(replies[r.parent_id]||=[]).push(r));
 const item=(r,rootId)=>{const name=r.author?.display_name||'Reader',canDelete=user&&(r.user_id===user.id||isAdmin());return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b style="font-size:13px">${esc(name)}</b> <span class="meta">${ago(r.created_at)}</span></div>${r.passage_quote?`<button class="quote" data-goto-passage="${r.id}" title="Show in chapter">“${esc(clip(r.passage_quote,180))}”</button>`:''}<div style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:4px 0;overflow-wrap:anywhere">${esc(r.body)}</div><div style="display:flex;gap:12px">${user?`<button class="linkbtn" data-reply="${rootId}" data-reply-name="${esc(name)}" data-reply-kind="${kind}">Reply</button>`:''}${canDelete?`<button class="linkbtn" data-confirm data-delete-${kind}="${r.id}">Delete</button>`:''}</div></div>`};
 return top.map(r=>`${item(r,r.id)}${(replies[r.id]||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(c=>`<div style="margin-left:16px;padding-left:10px;border-left:2px solid #f0e2f8">${item(c,r.id)}</div>`).join('')}`).join('');
}
const replyBar=kind=>`<div id="${kind}-reply-to" class="meta" style="margin-bottom:4px" ${replyTo?.kind===kind?'':'hidden'}>Replying to <b>${esc(replyTo?.name||'')}</b> · <button class="linkbtn" id="cancel-reply">Cancel</button></div>`;
const clip=(s,n)=>s.length>n?s.slice(0,n).trimEnd()+'…':s;
async function loadComments(){
 const el=$('comment-list');if(!el||!readerState)return;
 if(!supabase||!isDb(readerState.entry.id)){el.innerHTML='<div class="meta">Comments appear here once stories are published from the author dashboard.</div>';return}
 if(!user){el.innerHTML='<div class="meta">Sign in to read and join the conversation.</div>';return}
 const chapterId=readerState.entry.id;
 const {data,error}=await supabase.from('comments').select('id,body,parent_id,created_at,user_id,passage_quote,passage_start,passage_end,author:profiles!comments_user_profile_fk(display_name)').eq('chapter_id',chapterId).order('created_at').limit(500);
 if(!$('comment-list')||readerState?.entry.id!==chapterId)return; // the reader moved on while this loaded
 if(error){$('comment-list').innerHTML=`<div class="meta">${esc(error.message)}</div>`;return}
 chapterComments=data||[];passageRanges=locatePassages(readerState.body,chapterComments);
 readerState.entry.comments_count=chapterComments.length;const sc=$('stat-comments');if(sc&&readerState.entry.reads_count!==undefined)sc.outerHTML=stat('comments',chapterComments.length,'comments','stat-comments');
 refreshHighlights();renderComments();
}
function renderComments(){
 const el=$('comment-list');if(!el)return;
 let rows=chapterComments,top='';
 if(focusIds){const ids=new Set(focusIds);rows=rows.filter(r=>ids.has(r.id)||ids.has(r.parent_id));top=`<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">Comments on this passage<button class="linkbtn" id="show-all-comments">Show all</button></div>`}
 el.innerHTML=top+(thread(rows,'comment')||'<div class="meta">No comments yet. Highlight a line in the chapter, or write below, to start the conversation.</div>');
}

// ---------- Passage highlights (Wattpad-style inline comments) ----------
// Each paragraph remembers its offset in the chapter text, so a selection maps to body.slice(start,end).
function splitParagraphs(body){const out=[],re=/\n{2,}/g;let last=0,m;while((m=re.exec(body))){out.push({start:last,text:body.slice(last,m.index)});last=m.index+m[0].length}out.push({start:last,text:body.slice(last)});return out.filter(p=>p.text.trim())}
// Where each passage comment sits in the current text. If the chapter was edited since, find the quote again; drop it if it's gone.
function locatePassages(body,rows){const out=[];for(const r of rows){if(r.parent_id||!r.passage_quote)continue;let s=r.passage_start,e=r.passage_end;if(body.slice(s,e)!==r.passage_quote){s=body.indexOf(r.passage_quote);e=s+r.passage_quote.length}if(s>=0)out.push({s,e,id:r.id})}return out}
function paragraphHtml(p,ranges){
 const end=p.start+p.text.length,mine=ranges.filter(r=>r.s<end&&r.e>p.start),cuts=new Set([p.start,end]);
 mine.forEach(r=>{cuts.add(Math.max(r.s,p.start));cuts.add(Math.min(r.e,end))});
 const pts=[...cuts].sort((a,b)=>a-b);let html='';
 for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],seg=esc(p.text.slice(a-p.start,b-p.start)),ids=mine.filter(r=>r.s<=a&&r.e>=b).map(r=>r.id);html+=ids.length?`<mark class="hl${ids.includes('draft')?' draft':''}" data-ids="${ids.join(',')}">${seg}</mark>`:seg}
 return `<p data-start="${p.start}">${html}</p>`;
}
function refreshHighlights(){
 const el=$('reader-paras');if(!el||!readerState)return;
 const ranges=passageDraft?[...passageRanges,{s:passageDraft.start,e:passageDraft.end,id:'draft'}]:passageRanges;
 el.innerHTML=splitParagraphs(readerState.body).map(p=>paragraphHtml(p,ranges)).join('');
}
// Character offset of a DOM selection point within the chapter text, or null when it's outside the text.
function bodyOffset(node,offset){
 const p=(node.nodeType===1?node:node.parentElement)?.closest('#reader-paras p[data-start]');if(!p)return null;
 const r=document.createRange();r.setStart(p,0);r.setEnd(node,offset);return Number(p.dataset.start)+r.toString().length;
}
let selTimer;
function onSelectionChange(){
 const fab=$('hl-fab'),sel=getSelection();
 const hide=()=>{clearTimeout(selTimer);selTimer=setTimeout(()=>fab.classList.add('hide'),350)}; // delay so a tap on the button still lands
 if(page!=='Reader'||!readerState||!sel.rangeCount||sel.isCollapsed)return hide();
 const range=sel.getRangeAt(0),body=readerState.body;
 let s=bodyOffset(range.startContainer,range.startOffset),e=bodyOffset(range.endContainer,range.endOffset);
 if(s===null||e===null)return hide();
 while(s<e&&/\s/.test(body[s]))s++;while(e>s&&/\s/.test(body[e-1]))e--;
 if(e<=s)return hide();
 clearTimeout(selTimer);
 const tooLong=e-s>1000;
 pendingPassage=tooLong?null:{start:s,end:e,quote:body.slice(s,e)};
 fab.disabled=tooLong;fab.textContent=tooLong?'Select a shorter passage':'💬 Comment';
 fab.classList.remove('hide');
 const rect=range.getBoundingClientRect(),w=fab.offsetWidth;
 fab.style.top=`${rect.bottom+window.scrollY+10}px`;
 fab.style.left=`${Math.max(8,Math.min(rect.left+window.scrollX+rect.width/2-w/2,window.scrollX+document.documentElement.clientWidth-w-8))}px`;
}
function updateComposer(){
 const bar=$('passage-bar');
 if(bar){bar.hidden=!passageDraft;if(passageDraft)bar.querySelector('q').textContent=clip(passageDraft.quote,140)}
 refreshHighlights();
}
function flashPassage(id){
 const mark=[...document.querySelectorAll('#reader-paras mark.hl')].find(m=>m.dataset.ids.split(',').includes(id));
 if(!mark){toast('That passage has since been changed by the author.');return}
 mark.scrollIntoView({behavior:'smooth',block:'center'});
 document.querySelectorAll('#reader-paras mark.hl').forEach(m=>m.classList.toggle('flash',m.dataset.ids.split(',').includes(id)));
 setTimeout(()=>document.querySelectorAll('mark.flash').forEach(m=>m.classList.remove('flash')),1800);
}

// ---------- Pages ----------
function home(){
 if(!books.length)return `${head('Welcome to your reading space')}<div class="empty">Stories will appear here as soon as they are published.</div>`;
 const recent=Object.entries(progress).filter(([id])=>findBook(id)).sort((a,b)=>b[1].at-a[1].at)[0];
 const b=recent&&findBook(recent[0]),p=recent?.[1];
 const art=books.length>1?books.slice(1,4):books.slice(0,3);
 const cont=b?`<div class="sectionhead"><h2>Pick up where you left off</h2><button class="linkbtn" data-page="Library">Your library →</button></div><section class="continue">${img(b)}<div style="align-self:center"><div class="eyebrow">CONTINUE READING</div><div class="bookname" style="font-size:21px">${esc(b.title)}</div><div class="meta">Chapter ${p.ch} · ${esc(b.genre)}</div><div class="progress"><span style="width:${p.pct}%"></span></div><div class="meta" style="margin-bottom:12px">${p.pct}% read</div><button class="btn" data-read="${esc(b.id)}" data-chapter="${p.ch}">Continue reading</button></div></section>`:'';
 return `<section class="hero"><div><div class="eyebrow">A LITTLE ESCAPE, JUST FOR YOU</div><h1>Every story leaves<br><em>a little magic.</em></h1><p>Step into stories of love, friendship, secrets, and the wonderfully messy business of being human.</p><button class="btn" id="explore-stories">Explore stories ↓</button></div><div class="heroart">${art.map(b=>img(b)).join('')}</div></section>${cont}<div class="sectionhead" id="all-stories"><h2>Stories to fall into</h2></div><div class="grid">${books.map(card).join('')}</div>`;
}
// The Library is the reader's own collection: only books they've added.
function library(){
 const mine=books.filter(b=>saved.includes(String(b.id)));
 const list=mine.filter(b=>filter==='All'||filter==='Romance'&&b.genre==='Romance'||filter==='Drama'&&b.genre==='Drama'||filter==='Completed'&&b.status==='completed'||filter==='Ongoing'&&b.status==='ongoing');
 const empty=mine.length?'No books in your library match that filter.':'Your library is empty. Open any story and tap <b>＋ Add to library</b> to keep it here.';
 return `${head('Your Library','The stories you’ve added, all in one place.')}${mine.length?`<div class="filters">${['All','Romance','Drama','Completed','Ongoing'].map(f=>`<button class="chip ${filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('')}</div>`:''}<div class="grid">${list.map(card).join('')||`<div class="empty" style="grid-column:1/-1">${empty}${mine.length?'':'<div style="margin-top:12px"><button class="btn small" data-page="Home">Find a story</button></div>'}</div>`}</div>`;
}
// Search covers every published story, not just the reader's library.
function search(){
 const q=query.trim().toLowerCase(),list=books.filter(b=>b.title.toLowerCase().includes(q));
 return `${head('Search',`Results for “${esc(query.trim())}”`)}<div class="grid">${list.map(card).join('')||'<div class="empty" style="grid-column:1/-1">No stories match that search. Try another title.</div>'}</div>`;
}
async function detail(){
 let b=findBook(selected);if(!b)return library();
 const list=await getChapters(b),p=progress[b.id];
 const rows=list.map(c=>`<button class="row" data-read="${esc(b.id)}" data-chapter="${c.chapter_number}" style="width:100%;border:0;background:white;text-align:left"><span class="meta">${String(c.chapter_number).padStart(2,'0')}</span><span class="grow"><b style="font-size:13px">${chapterLabel(c.chapter_number,c.title)}</b>${isLocked(c)?'<div class="meta">🔒 Sign in to read</div>':p?.ch===c.chapter_number?'<div class="meta">You are here</div>':''}</span>${c.reads_count!==undefined?`<span class="stats">${stat('reads',c.reads_count,'reads')}</span>`:''}<span style="color:var(--purple)">→</span></button>`).join('')||'<div class="meta">The first chapter is on its way.</div>';
 return `<button class="linkbtn" data-page="Library">← Back to library</button><div class="book-detail" style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:25px;margin-top:22px">${img(b)}<div><span class="badge">${esc(b.status)}</span><h1 class="title">${esc(b.title)}</h1><p class="meta">${esc(b.genre)} · By ${esc(authorName(b))}</p><div class="stats" style="font-size:13px;margin:4px 0 2px">${b.reads_count!==undefined?stat('reads',b.reads_count,'reads'):''}${stat('parts',list.length,'chapters')}</div><p class="sub">${esc(b.description||'An original story from Dionce Creativity.')}</p><div style="display:flex;gap:9px;flex-wrap:wrap;margin:16px 0">${list.length?`<button class="btn" data-read="${esc(b.id)}" data-chapter="${p?.ch||list[0].chapter_number}">${p?`Continue chapter ${p.ch} →`:'Start reading →'}</button>`:''}<button class="btn secondary" id="save-book">${saved.includes(String(b.id))?'✓ In your library':'＋ Add to library'}</button></div></div></div><div class="sectionhead"><h2>Chapters</h2><span class="meta">${list.length} chapters</span></div><div class="panel">${rows}</div>`;
}
async function reader(){
 let b=findBook(selected);if(!b){page='Library';return library()}
 const list=await getChapters(b);
 if(!list.length){page='Detail';return detail()}
 let index=list.findIndex(c=>c.chapter_number===readChapter);if(index<0)index=0;
 const entry=list[index];readChapter=entry.chapter_number;
 if(isLocked(entry)){
  readerState={book:b,list,index,entry,body:''};
  const free=list.filter(c=>c.is_free).length;
  return `<button class="linkbtn" data-page="Detail">← Back to story</button><div style="text-align:center;margin:20px 0 24px"><div class="eyebrow">${esc(b.title)}</div><h1 class="title">${chapterLabel(entry.chapter_number,entry.title)}</h1></div><div class="paper" style="text-align:center;max-width:560px;margin:auto"><div style="font-size:38px">🔒</div><h2 style="font-family:Georgia,serif;margin:8px 0">Sign in to keep reading</h2><p class="sub">The first ${free} chapter${free===1?' is':'s are'} free. Create a free account or sign in to continue <i>${esc(b.title)}</i>. It takes less than a minute.</p><button class="btn" id="signin-to-read">Sign in or create an account</button><div style="margin-top:18px"><button class="btn secondary small" id="prev-chapter" ${index===0?'disabled':''}>← Previous chapter</button></div></div>`;
 }
 setProgress(b,entry,index,list.length);
 const chapter=await getChapterBody(b,entry);
 const text=String(chapter.body||'').replace(/\r\n?/g,'\n');
 readerState={book:b,list,index,entry,body:text};chapterComments=[];passageRanges=[];passageDraft=null;focusIds=null;
 const body=`<div id="reader-paras">${splitParagraphs(text).map(p=>paragraphHtml(p,[])).join('')}</div>`;
 const demo=!isDb(entry.id);
 return `<button class="linkbtn" data-page="Detail">← Back to story</button><div style="text-align:center;margin:20px 0 24px"><div class="eyebrow">${esc(b.title)}</div><h1 class="title">${chapterLabel(entry.chapter_number,chapter.title)}</h1><div class="meta">By ${esc(authorName(b))}</div>${entry.reads_count!==undefined?`<div class="stats" style="justify-content:center;margin-top:8px">${stat('reads',entry.reads_count,'reads','stat-reads')}${stat('comments',entry.comments_count,'comments','stat-comments')}</div>`:''}</div><div style="display:flex;gap:8px;margin:14px 0 22px"><button class="chip" id="font-down">A−</button><button class="chip" id="font-up">A+</button></div><div class="readerlayout"><article class="paper"><div class="readertext" id="reader-text" style="font-size:${fontSize}px">${body}${demo?'<p style="font:11px system-ui;color:var(--muted)">This is sample text. Real chapters appear once they are published from the author dashboard.</p>':''}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:18px;margin-top:20px"><button class="btn secondary" id="prev-chapter" ${index===0?'disabled':''}>← Previous</button><span class="meta">${index+1} / ${list.length}</span><button class="btn" id="next-chapter" ${index===list.length-1?'disabled':''}>Next chapter →</button></div></article><aside class="panel" id="comments" style="min-width:0"><h3 style="font:22px Georgia,serif;margin-top:0">Reader reactions 💬</h3><p class="meta" style="margin-top:-6px">Tip: highlight any line in the chapter to comment on it.</p>${user?`${replyBar('comment')}<div id="passage-bar" class="meta" style="margin-bottom:6px" hidden>Commenting on <q style="font:italic 12px Georgia,serif;color:#6b4d72"></q> · <button class="linkbtn" id="cancel-passage">Cancel</button></div><textarea id="comment-input" class="field" rows="3" maxlength="3000" placeholder="Say what you're thinking…"></textarea><button class="btn small" id="post-comment" style="width:100%;margin-bottom:12px">Post comment</button>`:`<div class="notice">Sign in to read and post comments.</div><button class="btn small secondary" data-page="Profile" style="width:100%;margin-bottom:12px">Sign in</button>`}<div id="comment-list"><div class="meta">Loading comments…</div></div></aside></div>`;
}
async function community(){
 const intro=head('The Community','A place for theories, favourite characters, and fictional-character interventions.');
 if(!supabase)return `${intro}<div class="empty">Community discussions open once the site is connected to its database.</div>`;
 if(!user)return `${intro}<div class="panel"><p class="sub" style="margin-top:0">Sign in to read and join reader conversations.</p><button class="btn" data-page="Profile">Sign in</button></div>`;
 const {data,error}=await supabase.from('discussions').select('id,body,parent_id,created_at,user_id,author:profiles!discussions_user_profile_fk(display_name)').order('created_at',{ascending:false}).limit(200);
 const list=error?`<div class="meta">${esc(error.message)}</div>`:thread(data||[],'discussion')||'<div class="empty">No conversations yet. Start the first one!</div>';
 return `${intro}<div class="panel"><h3 style="font-family:Georgia,serif;margin-top:0">Start a discussion</h3>${replyBar('discussion')}<textarea class="field" id="discussion-input" rows="3" maxlength="3000" placeholder="Which character are we defending today?"></textarea><button class="btn" id="post-discussion">Post</button></div><div class="sectionhead"><h2>Reader conversations</h2></div><div class="panel">${list}</div>`;
}
// The owner posts, edits, publishes and deletes updates right here; readers see only published ones.
async function updates(){
 const intro=head('Updates','New chapters and announcements from Dionce Creativity.');
 if(!supabase)return `${intro}<div class="empty">New chapters and announcements will appear here once the site is connected.</div>`;
 const owner=isAdmin();
 let newsQuery=supabase.from('announcements').select('id,title,body,published_at,created_at');
 if(!owner)newsQuery=newsQuery.not('published_at','is',null);
 let [{data:news},{data:chapters,error:chapterError}]=await Promise.all([
  newsQuery.order('created_at',{ascending:false}).limit(30),
  supabase.from('chapter_index').select('chapter_number,title,published_at,book_id').order('published_at',{ascending:false}).limit(15)
 ]);
 // Before 004_signin_to_read.sql has run there is no chapter_index view.
 if(chapterError)({data:chapters}=await supabase.from('chapters').select('chapter_number,title,published_at,book_id').eq('is_published',true).order('published_at',{ascending:false}).limit(15));
 const newsItem=a=>editingNews===a.id
  ?`<div style="padding:13px 0;border-bottom:1px solid var(--line)"><label class="fieldlabel">Title</label><input id="edit-news-title" class="field" maxlength="140" value="${esc(a.title)}"><label class="fieldlabel">Message</label><textarea id="edit-news-body" class="field" rows="4">${esc(a.body)}</textarea><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" data-save-news="${a.id}">Save changes</button><button class="btn secondary small" id="cancel-edit-news">Cancel</button></div></div>`
  :`<div class="row" style="align-items:flex-start"><span style="font-size:20px">📣</span><div class="grow"><b>${esc(a.title)}</b> <span class="meta">${a.published_at?ago(a.published_at):'Draft · only you can see this'}</span><div style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:4px">${esc(a.body)}</div>${owner?`<div style="display:flex;gap:14px;margin-top:6px"><button class="linkbtn" data-edit-news="${a.id}">Edit</button><button class="linkbtn" data-toggle-news="${a.id}" data-published="${!!a.published_at}">${a.published_at?'Unpublish':'Publish'}</button><button class="linkbtn" data-confirm data-delete-news="${a.id}">Delete</button></div>`:''}</div></div>`;
 const items=[...(news||[]).map(a=>({at:a.published_at||a.created_at,html:newsItem(a)})),
  ...(chapters||[]).filter(c=>findBook(c.book_id)).map(c=>({at:c.published_at,html:`<button class="row" data-read="${c.book_id}" data-chapter="${c.chapter_number}" style="width:100%;border:0;border-bottom:1px solid var(--line);background:white;text-align:left"><span style="font-size:20px">📖</span><span class="grow"><b>New: ${chapterLabel(c.chapter_number,c.title)}</b><div class="meta">${esc(findBook(c.book_id).title)} · ${ago(c.published_at)}</div></span><span style="color:var(--purple)">→</span></button>`}))
 ].sort((a,b)=>new Date(b.at)-new Date(a.at));
 const composer=owner?`<div class="panel" style="margin-bottom:18px"><h3 style="font-family:Georgia,serif;margin-top:0">Post an update</h3><label class="fieldlabel">Title</label><input id="news-title" class="field" maxlength="140" placeholder="New book coming soon!"><label class="fieldlabel">Message</label><textarea id="news-body" class="field" rows="3" placeholder="Share news with your readers"></textarea><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="news-publish">Publish now</button><button class="btn secondary" id="news-draft">Save as draft</button></div></div>`:'';
 return `${intro}${composer}<div class="panel">${items.map(i=>i.html).join('')||'<div class="meta">Nothing new yet. Check back soon!</div>'}</div>`;
}
async function profilePage(){
 const intro=head('Your profile','Your own little corner of Dionce Creativity.');
 if(recovering)return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Choose a new password</h2><div class="fieldlabel">New password</div><input class="field" id="new-password" type="password" autocomplete="new-password" placeholder="At least 8 characters"><button class="btn" id="update-password">Save new password</button></div>`;
 if(user)return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Your reader account</h2><p class="meta">${esc(user.email)}${isAdmin()?' · Site owner':''}</p><div class="fieldlabel">Display name (shown on your comments)</div><input class="field" id="display-name" maxlength="60" value="${esc(profile?.display_name||'')}"><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn" id="save-profile">Save</button>${isAdmin()?'<button class="btn secondary" data-page="Admin">Author dashboard</button>':''}</div></div>`;
 return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Welcome, reader</h2>${returnTo?`<div class="notice">Sign in or create a free account to keep reading <b>${esc(findBook(returnTo.book)?.title||'your story')}</b>.</div>`:''}<p class="sub">Create an account to read every chapter, save your reading progress across devices, and join discussions.</p>${supabaseReady?'':'<div class="notice">Accounts are not active yet. Add the Supabase project settings to config.js and run the setup SQL.</div>'}<div class="fieldlabel">Email</div><input class="field" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"><div class="fieldlabel">Password</div><input class="field" id="auth-password" type="password" autocomplete="current-password" placeholder="At least 8 characters"><div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center"><button class="btn" id="signup">Create account</button><button class="btn secondary" id="signin">Sign in</button><button class="linkbtn" id="forgot-password">Forgot password?</button></div></div>`;
}
const adminCtx=()=>({supabase,user,toast,$,esc,head,refresh:async reload=>{if(reload)await loadBooks();await render()}});
async function admin(){
 if(!supabaseReady)return `${head('Author dashboard','Your private publishing room.')}<div class="notice">Publishing is disabled until Supabase is configured. Follow the steps in SETUP.md.</div><div class="panel"><h3 style="font-family:Georgia,serif;margin-top:0">What you’ll manage here</h3><p class="sub">Books · chapters · covers · publication status · announcements</p></div>`;
 if(!user)return `${head('Author dashboard','This area is for Dionce Creativity’s owner only.')}<div class="notice">Sign in with the account you have authorised as the site owner.</div><button class="btn" data-page="Profile">Sign in</button>`;
 if(!isAdmin())return `${head('Author dashboard','Private publishing area')}<div class="notice">This account is not authorised as the site owner. Set your role to admin using the SQL instructions in SETUP.md.</div>`;
 return renderAdmin(adminCtx());
}
async function render(){
 if(page==='Admin'&&!isAdmin())page='Home'; // e.g. after signing out while on the dashboard
 const id=++renderId;updateNav();
 const pages={Home:home,Library:library,Search:search,Detail:detail,Reader:reader,Community:community,Updates:updates,Profile:profilePage,Admin:admin};
 const content=await (pages[page]||home)();
 if(id!==renderId)return; // a newer render started while this one was loading
 updateNav();$('main').innerHTML=content;$('hl-fab').classList.add('hide');
 if(page==='Reader'){loadComments();scheduleRead()}
}
// Anonymous browser id, so signed-out reads can be de-duplicated without an account.
const visitorId=(()=>{let v=lsGet('dc_visitor',null);if(!isDb(v)){v=crypto.randomUUID();lsSet('dc_visitor',v)}return v})();
let readTimer;
function scheduleRead(){
 clearTimeout(readTimer);
 const entry=readerState?.entry;
 if(!supabase||!entry||!isDb(entry.id)||isLocked(entry)||isAdmin())return;
 readTimer=setTimeout(async()=>{
  if(page!=='Reader'||readerState?.entry.id!==entry.id)return; // they moved on
  const {data:counted,error}=await supabase.rpc('record_read',{p_chapter:entry.id,p_visitor:visitorId});
  if(error){console.warn('Read not recorded:',error.message);return}
  if(counted){entry.reads_count=(Number(entry.reads_count)||0)+1;const b=readerState.book;b.reads_count=(Number(b.reads_count)||0)+1;
   const el=$('stat-reads');if(el&&readerState?.entry.id===entry.id)el.outerHTML=stat('reads',entry.reads_count,'reads','stat-reads')}
 },5000);
}
const go=async p=>{page=p;replyTo=null;editingNews=null;if(p!=='Search'){query='';$('search').value=''}await render();window.scrollTo(0,0)};
// Account menu under the profile picture (signed-in only).
function closeAccountMenu(){$('account-menu').classList.add('hide');$('avatar-btn').setAttribute('aria-expanded','false')}
function toggleAccountMenu(){
 const menu=$('account-menu');if(!menu.classList.contains('hide'))return closeAccountMenu();
 menu.innerHTML=`<div class="who"><b>${esc(profile?.display_name||'Reader')}</b><br>${esc(user.email)}</div><button data-page="Profile" role="menuitem">My profile</button><button data-page="Library" role="menuitem">My library</button>${isAdmin()?'<button data-page="Admin" role="menuitem">Author dashboard</button>':''}<button id="signout" role="menuitem" style="color:#b3245f">Sign out</button>`;
 menu.classList.remove('hide');$('avatar-btn').setAttribute('aria-expanded','true');
}
const narrow=()=>matchMedia('(max-width:720px)').matches;

// ---------- Events ----------
document.addEventListener('click',async e=>{
 if(!e.target.closest('#avatar-btn'))closeAccountMenu();
 // Tapping a highlighted passage filters the comment list to that passage's comments.
 const mark=e.target.closest('#reader-paras mark.hl');
 if(mark&&getSelection().isCollapsed){const ids=mark.dataset.ids.split(',').filter(x=>x!=='draft');if(ids.length){focusIds=ids;renderComments();if(narrow())$('comments').scrollIntoView({behavior:'smooth',block:'start'})}return}
 const t=e.target.closest('button');if(!t||t.disabled)return;const d=t.dataset;
 // Two-tap confirmation for destructive buttons (the viewer can't rely on confirm()).
 if(t.hasAttribute('data-confirm')&&d.armed!=='1'){d.armed='1';d.label=t.textContent;t.textContent='Tap again to confirm';setTimeout(()=>{if(t.isConnected&&d.armed==='1'){d.armed='';t.textContent=d.label}},4000);return}
 if(d.page){if(d.page==='Admin')resetAdminView();if(d.page!=='Profile')returnTo=null;await go(d.page);return}
 if(d.open){selected=d.open;await go('Detail');return}
 if(d.filter){filter=d.filter;render();return}
 if(d.read){selected=d.read;readChapter=Number(d.chapter||1);await go('Reader');return}
 if(d.gotoPassage){flashPassage(d.gotoPassage);return}
 if(d.editNews){editingNews=d.editNews;await render();return}
 if(d.saveNews){const title=$('edit-news-title').value.trim(),body=$('edit-news-body').value.trim();if(!title||!body){toast('Add a title and a message.');return}const {data,error}=await supabase.from('announcements').update({title,body}).eq('id',d.saveNews).select('id');if(error||!data?.length){toast(error?.message||'Could not save. Please sign in again.');return}editingNews=null;toast('Update saved.');await render();return}
 if(d.toggleNews){const publish=d.published!=='true';const {error}=await supabase.from('announcements').update({published_at:publish?new Date().toISOString():null}).eq('id',d.toggleNews);toast(error?error.message:publish?'Update published.':'Update unpublished.');await render();return}
 if(d.deleteNews){const {error}=await supabase.from('announcements').delete().eq('id',d.deleteNews);toast(error?error.message:'Update deleted.');await render();return}
 if(d.reply){if(d.replyKind==='comment'&&passageDraft){passageDraft=null;updateComposer()}replyTo={id:d.reply,name:d.replyName,kind:d.replyKind};const bar=$(`${d.replyKind}-reply-to`);if(bar){bar.hidden=false;bar.querySelector('b').textContent=d.replyName}$(`${d.replyKind}-input`)?.focus();return}
 if(d.deleteComment||d.deleteDiscussion){const table=d.deleteComment?'comments':'discussions';const {error}=await supabase.from(table).delete().eq('id',d.deleteComment||d.deleteDiscussion);toast(error?error.message:'Deleted.');if(d.deleteComment)loadComments();else render();return}
 if(page==='Admin'&&user&&isAdmin()&&await handleAdminClick(t,adminCtx()))return;
 switch(t.id){
 case'save-book':await toggleSave(selected);render();toast(saved.includes(String(selected))?'Added to your library.':'Removed from your library.');break;
 case'explore-stories':$('all-stories')?.scrollIntoView({behavior:'smooth',block:'start'});break;
 case'avatar-btn':if(!user){await go('Profile');break}toggleAccountMenu();break;
 case'font-up':case'font-down':fontSize=t.id==='font-up'?Math.min(29,fontSize+2):Math.max(15,fontSize-2);if($('reader-text'))$('reader-text').style.fontSize=`${fontSize}px`;break;
 case'next-chapter':case'prev-chapter':{if(!readerState)break;const next=readerState.list[readerState.index+(t.id==='next-chapter'?1:-1)];if(next){readChapter=next.chapter_number;await go('Reader')}break}
 case'cancel-reply':{const kind=replyTo?.kind;replyTo=null;if(kind)$(`${kind}-reply-to`).hidden=true;break}
 case'hl-fab':{
  t.classList.add('hide');const passage=pendingPassage;if(!passage)break;
  if(!supabase||!isDb(readerState?.entry.id)){toast('Comments open on published chapters.');break}
  if(!user){toast('Sign in to comment on a passage.');break}
  getSelection().removeAllRanges();
  passageDraft=passage;replyTo=null;$('comment-reply-to').hidden=true;updateComposer();
  if(narrow())$('comments').scrollIntoView({behavior:'smooth',block:'start'});
  $('comment-input').focus({preventScroll:true});break}
 case'cancel-passage':passageDraft=null;updateComposer();break;
 case'show-all-comments':focusIds=null;renderComments();break;
 case'cancel-edit-news':editingNews=null;render();break;
 case'news-publish':case'news-draft':{
  const title=$('news-title').value.trim(),body=$('news-body').value.trim();
  if(!title||!body){toast('Add a title and a message.');break}
  t.disabled=true;
  const {error}=await supabase.from('announcements').insert({title,body,author_id:user.id,published_at:t.id==='news-publish'?new Date().toISOString():null});
  t.disabled=false;if(error){toast(error.message);break}
  toast(t.id==='news-publish'?'Update published.':'Update saved as a draft.');render();break}
 case'signup':case'signin':{if(!supabase){toast('Connect Supabase first — see SETUP.md.');break}let email=$('auth-email').value.trim(),password=$('auth-password').value;if(!email||password.length<8){toast('Enter a valid email and a password of at least 8 characters.');break}t.disabled=true;let result=t.id==='signup'?await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await supabase.auth.signInWithPassword({email,password});t.disabled=false;if(result.error){toast(result.error.message);break}await loadUser();toast(t.id==='signup'&&!result.data.session?'Account created. Check your email to confirm it, then sign in.':'You are signed in.');
  // Signed in from the "keep reading" screen: take them straight back to that chapter.
  if(user&&returnTo){selected=returnTo.book;readChapter=returnTo.chapter;returnTo=null;await go('Reader');break}
  render();break}
 case'signin-to-read':returnTo={book:selected,chapter:readChapter};await go('Profile');break;
 case'forgot-password':{if(!supabase){toast('Connect Supabase first — see SETUP.md.');break}const email=$('auth-email').value.trim();if(!email){toast('Enter your email above first.');break}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});toast(error?error.message:'If that email has an account, a reset link is on its way.');break}
 case'update-password':{const password=$('new-password').value;if(password.length<8){toast('Use at least 8 characters.');break}const {error}=await supabase.auth.updateUser({password});if(error){toast(error.message);break}recovering=false;toast('Password updated.');render();break}
 case'save-profile':{const display_name=$('display-name').value.trim();if(!display_name){toast('Display name cannot be empty.');break}const {error}=await supabase.from('profiles').update({display_name}).eq('id',user.id);if(error){toast(error.message);break}profile={...profile,display_name};toast('Profile saved.');updateNav();break}
 case'signout':await supabase?.auth.signOut();user=null;profile=null;saved=[];progress={};lsSet('dc_saved',saved);lsSet('dc_progress',progress);toast('You are signed out.');go('Home');break;
 case'post-comment':case'post-discussion':{
  const kind=t.id==='post-comment'?'comment':'discussion',input=$(`${kind}-input`),text=input?.value.trim();
  if(!text){toast('Write something first.');break}
  if(!supabase||!user){toast('Sign in to post.');break}
  if(kind==='comment'&&!isDb(readerState?.entry.id)){toast('Comments open on published chapters.');break}
  t.disabled=true;
  const row={user_id:user.id,body:text,parent_id:replyTo?.kind===kind?replyTo.id:null};
  if(kind==='comment'){row.chapter_id=readerState.entry.id;if(passageDraft&&!row.parent_id)Object.assign(row,{passage_quote:passageDraft.quote,passage_start:passageDraft.start,passage_end:passageDraft.end})}
  const {error}=await supabase.from(kind==='comment'?'comments':'discussions').insert(row);
  t.disabled=false;if(error){toast(error.message);break}
  input.value='';replyTo=null;toast('Posted.');
  if(kind==='comment'){$('comment-reply-to').hidden=true;passageDraft=null;updateComposer();loadComments()}else render();
  break}
 }
});
$('search').addEventListener('input',e=>{query=e.target.value;page=query.trim()?'Search':'Home';render()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAccountMenu()});
document.addEventListener('selectionchange',()=>{clearTimeout(window._selDebounce);window._selDebounce=setTimeout(onSelectionChange,120)});
// Keep the text selected while the Comment button is pressed.
$('hl-fab').addEventListener('mousedown',e=>e.preventDefault());
initAdmin();
if(supabase){supabase.auth.onAuthStateChange((event,session)=>{
 // Defer: calling Supabase inside this callback can deadlock the auth client.
 setTimeout(async()=>{
  if(event==='PASSWORD_RECOVERY'){recovering=true;page='Profile';await loadUser();render();return}
  if((session?.user?.id||null)!==(user?.id||null)){await loadUser();render()}
 },0);
})}
await loadUser();await loadBooks();if(!selected&&books[0])selected=books[0].id;render();
