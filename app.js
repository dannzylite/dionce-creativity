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

let books=supabase?[]:[...localBooks],page='Home',selected=supabase?null:'crush',filter='All',query='',fontSize=19,readChapter=1,user=null,profile=null,recovering=false,replyTo=null,readerState=null,renderId=0,chapterCache={};
let saved=lsGet('dc_saved',supabase?[]:['crush']),progress=normProgress(lsGet('dc_progress',supabase?{}:{crush:38}));
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isAdmin=()=>profile?.role==='admin';
const ago=d=>{const s=(Date.now()-new Date(d))/1000;if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;if(s<604800)return`${Math.floor(s/86400)}d ago`;return new Date(d).toLocaleDateString()};
const authorName=b=>b.author?.display_name||(isDb(b.id)?'Dionce Creativity':'Dionetta Ekwe');
const findBook=id=>books.find(x=>String(x.id)===String(id));
function toast(s){$('toast').textContent=s;$('toast').classList.remove('hide');clearTimeout(window._toast);window._toast=setTimeout(()=>$('toast').classList.add('hide'),3000)}
function img(b,cls='cover'){let path=b.cover_url||b.cover_path||'assets/logo.jpeg';return `<img class="${cls}" src="${esc(path)}" alt="Cover of ${esc(b.title)}" loading="lazy" onerror="this.style.background='#ead9ef';this.alt='Cover unavailable'">`}
function card(b){return `<button class="book" data-open="${esc(b.id)}">${img(b)}<div class="bookname">${esc(b.title)}</div><div class="meta">${esc(b.genre)} · ${b.chapters_count||0} chapters</div></button>`}
function head(title,sub=''){return `<div class="eyebrow">DIONCE CREATIVITY</div><h1 class="title">${title}</h1>${sub?`<p class="sub">${sub}</p>`:''}`}
function updateNav(){document.querySelectorAll('[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));document.querySelector('.sidebar [data-page="Admin"]').classList.toggle('hide',!isAdmin());document.querySelector('.avatar').textContent=(profile?.display_name||user?.email||'D').trim().charAt(0).toUpperCase()}

// ---------- Data loading ----------
async function loadBooks(){
 if(!supabase)return;
 const cols='id,title,slug,description,genre,status,cover_url,chapters_count,created_at';
 let {data,error}=await supabase.from('books').select(`${cols},author:profiles!books_author_profile_fk(display_name)`).eq('is_published',true).order('created_at',{ascending:false});
 // Before 002_mvp_features.sql has run there is no author link; load the books without bylines.
 if(error)({data,error}=await supabase.from('books').select(cols).eq('is_published',true).order('created_at',{ascending:false}));
 if(error){console.warn('Could not load published books:',error.message);toast('Could not load stories right now.')}
 books=data||[];chapterCache={};
 if(selected&&!findBook(selected))selected=null;
}
async function loadUser(){
 if(!supabase)return;
 const {data}=await supabase.auth.getUser();user=data?.user||null;profile=null;
 if(user){const {data:p}=await supabase.from('profiles').select('display_name,role').eq('id',user.id).maybeSingle();profile=p;await syncShelf()}
}
// Merge this browser's shelf and progress into the account, then use the account's copy.
async function syncShelf(){
 const [{data:s,error:e1},{data:p,error:e2}]=await Promise.all([
  supabase.from('library_saves').select('book_id').eq('user_id',user.id),
  supabase.from('reading_progress').select('book_id,chapter_id,progress_percent,updated_at,chapters(chapter_number)').eq('user_id',user.id)
 ]);
 if(e1||e2){console.warn('Could not sync shelf:',(e1||e2).message);return}
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
// Published chapter list for readers (number + title). Demo books get generated entries.
async function getChapters(b){
 if(chapterCache[b.id])return chapterCache[b.id];
 let list;
 if(supabase&&isDb(b.id)){const {data,error}=await supabase.from('chapters').select('id,chapter_number,title').eq('book_id',b.id).eq('is_published',true).order('chapter_number');if(error)toast(error.message);list=data||[]}
 else list=Array.from({length:Number(b.chapters_count)||1},(_,i)=>({id:`demo-${b.id}-${i+1}`,chapter_number:i+1,title:`Chapter ${i+1}`}));
 return chapterCache[b.id]=list;
}
async function getChapterBody(b,entry){
 if(supabase&&isDb(entry.id)){const {data}=await supabase.from('chapters').select('title,body').eq('id',entry.id).maybeSingle();if(data)return data}
 return {title:entry.title,body:`${b.sample||b.description||'Every story begins somewhere.'}\n\nShe took a breath, trying to make sense of the thoughts tumbling through her mind. The truth had a way of arriving at the worst possible moment, and this was no exception.\n\nMaybe the hardest part was not knowing what would happen next. It was knowing that whatever happened, nothing would ever be quite the same again.\n\nOutside, the world carried on as if nothing had changed. Inside, a new chapter had already begun.`};
}
const chapterLabel=(n,title)=>!title||title===`Chapter ${n}`?`Chapter ${n}`:`Chapter ${n}: ${esc(title)}`;

// ---------- Comment and discussion threads (one level of replies) ----------
function thread(rows,kind){
 const top=rows.filter(r=>!r.parent_id),replies={};
 rows.filter(r=>r.parent_id).forEach(r=>(replies[r.parent_id]||=[]).push(r));
 const item=(r,rootId)=>{const name=r.author?.display_name||'Reader',canDelete=user&&(r.user_id===user.id||isAdmin());return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b style="font-size:13px">${esc(name)}</b> <span class="meta">${ago(r.created_at)}</span></div><div style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin:4px 0;overflow-wrap:anywhere">${esc(r.body)}</div><div style="display:flex;gap:12px">${user?`<button class="linkbtn" data-reply="${rootId}" data-reply-name="${esc(name)}" data-reply-kind="${kind}">Reply</button>`:''}${canDelete?`<button class="linkbtn" data-confirm data-delete-${kind}="${r.id}">Delete</button>`:''}</div></div>`};
 return top.map(r=>`${item(r,r.id)}${(replies[r.id]||[]).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)).map(c=>`<div style="margin-left:16px;padding-left:10px;border-left:2px solid #f0e2f8">${item(c,r.id)}</div>`).join('')}`).join('');
}
const replyBar=kind=>`<div id="${kind}-reply-to" class="meta" style="margin-bottom:4px" ${replyTo?.kind===kind?'':'hidden'}>Replying to <b>${esc(replyTo?.name||'')}</b> · <button class="linkbtn" id="cancel-reply">Cancel</button></div>`;
async function loadComments(){
 const el=$('comment-list');if(!el||!readerState)return;
 if(!supabase||!isDb(readerState.entry.id)){el.innerHTML='<div class="meta">Comments appear here once stories are published from the author dashboard.</div>';return}
 if(!user){el.innerHTML='<div class="meta">Sign in to read and join the conversation.</div>';return}
 const {data,error}=await supabase.from('comments').select('id,body,parent_id,created_at,user_id,author:profiles!comments_user_profile_fk(display_name)').eq('chapter_id',readerState.entry.id).order('created_at').limit(300);
 if(!$('comment-list'))return;
 $('comment-list').innerHTML=error?`<div class="meta">${esc(error.message)}</div>`:thread(data||[],'comment')||'<div class="meta">No comments yet. Be the first!</div>';
}

// ---------- Pages ----------
function home(){
 if(!books.length)return `${head('Welcome to your reading space')}<div class="empty">Stories will appear here as soon as they are published.</div>`;
 const recent=Object.entries(progress).filter(([id])=>findBook(id)).sort((a,b)=>b[1].at-a[1].at)[0];
 const b=recent&&findBook(recent[0]),p=recent?.[1];
 const art=books.length>1?books.slice(1,4):books.slice(0,3);
 const cont=b?`<div class="sectionhead"><h2>Pick up where you left off</h2><button class="linkbtn" data-page="Library">Your library →</button></div><section class="continue">${img(b)}<div style="align-self:center"><div class="eyebrow">CONTINUE READING</div><div class="bookname" style="font-size:21px">${esc(b.title)}</div><div class="meta">Chapter ${p.ch} · ${esc(b.genre)}</div><div class="progress"><span style="width:${p.pct}%"></span></div><div class="meta" style="margin-bottom:12px">${p.pct}% read</div><button class="btn" data-read="${esc(b.id)}" data-chapter="${p.ch}">Continue reading</button></div></section>`:'';
 return `<section class="hero"><div><div class="eyebrow">A LITTLE ESCAPE, JUST FOR YOU</div><h1>Every story leaves<br><em>a little magic.</em></h1><p>Step into stories of love, friendship, secrets, and the wonderfully messy business of being human.</p><button class="btn" data-page="Library">Explore the library →</button></div><div class="heroart">${art.map(b=>img(b)).join('')}</div></section>${cont}<div class="sectionhead"><h2>Stories to fall into</h2><button class="linkbtn" data-page="Library">View all →</button></div><div class="grid">${books.slice(0,5).map(card).join('')}</div><div class="sectionhead"><h2>From your shelf</h2></div><div class="grid">${books.filter(b=>saved.includes(String(b.id))).map(card).join('')||'<div class="empty" style="grid-column:1/-1">Save a story to keep it close.</div>'}</div>`;
}
function library(){let list=books.filter(b=>(filter==='All'||filter==='Saved'&&saved.includes(String(b.id))||filter==='Romance'&&b.genre==='Romance'||filter==='Drama'&&b.genre==='Drama'||filter==='Completed'&&b.status==='completed'||filter==='Ongoing'&&b.status==='ongoing')&&b.title.toLowerCase().includes(query.toLowerCase()));return `${head('The Library','Your next favourite story might be one tap away.')}<div class="filters">${['All','Romance','Drama','Completed','Ongoing','Saved'].map(f=>`<button class="chip ${filter===f?'active':''}" data-filter="${f}">${f}</button>`).join('')}</div><div class="grid">${list.map(card).join('')||`<div class="empty" style="grid-column:1/-1">${books.length?'No stories match that search. Try another title or filter.':'No stories have been published yet.'}</div>`}</div>`}
async function detail(){
 let b=findBook(selected);if(!b)return library();
 const list=await getChapters(b),p=progress[b.id];
 const rows=list.map(c=>`<button class="row" data-read="${esc(b.id)}" data-chapter="${c.chapter_number}" style="width:100%;border:0;background:white;text-align:left"><span class="meta">${String(c.chapter_number).padStart(2,'0')}</span><span class="grow"><b style="font-size:13px">${chapterLabel(c.chapter_number,c.title)}</b>${p?.ch===c.chapter_number?'<div class="meta">You are here</div>':''}</span><span style="color:var(--purple)">→</span></button>`).join('')||'<div class="meta">The first chapter is on its way.</div>';
 return `<button class="linkbtn" data-page="Library">← Back to library</button><div class="book-detail" style="display:grid;grid-template-columns:220px minmax(0,1fr);gap:25px;margin-top:22px">${img(b)}<div><span class="badge">${esc(b.status)}</span><h1 class="title">${esc(b.title)}</h1><p class="meta">${esc(b.genre)} · ${list.length} chapters · By ${esc(authorName(b))}</p><p class="sub">${esc(b.description||'An original story from Dionce Creativity.')}</p><div style="display:flex;gap:9px;flex-wrap:wrap;margin:16px 0">${list.length?`<button class="btn" data-read="${esc(b.id)}" data-chapter="${p?.ch||list[0].chapter_number}">${p?`Continue chapter ${p.ch} →`:'Start reading →'}</button>`:''}<button class="btn secondary" id="save-book">${saved.includes(String(b.id))?'✓ In your library':'＋ Add to library'}</button></div><div class="panel"><b style="font-family:Georgia,serif">About this story</b><p class="sub" style="margin-bottom:0">A Dionce Creativity original. Settle in, take your time, and remember: spoilers are a reader’s natural enemy.</p></div></div></div><div class="sectionhead"><h2>Chapters</h2><span class="meta">${list.length} chapters</span></div><div class="panel">${rows}</div>`;
}
async function reader(){
 let b=findBook(selected);if(!b){page='Library';return library()}
 const list=await getChapters(b);
 if(!list.length){page='Detail';return detail()}
 let index=list.findIndex(c=>c.chapter_number===readChapter);if(index<0)index=0;
 const entry=list[index];readChapter=entry.chapter_number;readerState={book:b,list,index,entry};
 setProgress(b,entry,index,list.length);
 const chapter=await getChapterBody(b,entry);
 const body=String(chapter.body||'').split(/\n{2,}/).map(p=>`<p>${esc(p).replace(/\n/g,'<br>')}</p>`).join('');
 const demo=!isDb(entry.id);
 return `<button class="linkbtn" data-page="Detail">← Back to story</button><div style="text-align:center;margin:20px 0 24px"><div class="eyebrow">${esc(b.title)}</div><h1 class="title">${chapterLabel(entry.chapter_number,chapter.title)}</h1><div class="meta">By ${esc(authorName(b))}</div></div><div style="display:flex;gap:8px;margin:14px 0 22px"><button class="chip" id="font-down">A−</button><button class="chip" id="font-up">A+</button></div><div class="readerlayout"><article class="paper"><div class="readertext" id="reader-text" style="font-size:${fontSize}px">${body}${demo?'<p style="font:11px system-ui;color:var(--muted)">This is sample text. Real chapters appear once they are published from the author dashboard.</p>':''}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border-top:1px solid var(--line);padding-top:18px;margin-top:20px"><button class="btn secondary" id="prev-chapter" ${index===0?'disabled':''}>← Previous</button><span class="meta">${index+1} / ${list.length}</span><button class="btn" id="next-chapter" ${index===list.length-1?'disabled':''}>Next chapter →</button></div></article><aside class="panel" id="comments" style="min-width:0"><h3 style="font:22px Georgia,serif;margin-top:0">Reader reactions 💬</h3>${user?`${replyBar('comment')}<textarea id="comment-input" class="field" rows="3" maxlength="3000" placeholder="Say what you're thinking…"></textarea><button class="btn small" id="post-comment" style="width:100%;margin-bottom:12px">Post comment</button>`:`<div class="notice">Sign in to read and post comments.</div><button class="btn small secondary" data-page="Profile" style="width:100%;margin-bottom:12px">Sign in</button>`}<div id="comment-list"><div class="meta">Loading comments…</div></div></aside></div>`;
}
async function community(){
 const intro=head('The Community','A place for theories, favourite characters, and fictional-character interventions.');
 if(!supabase)return `${intro}<div class="empty">Community discussions open once the site is connected to its database.</div>`;
 if(!user)return `${intro}<div class="panel"><p class="sub" style="margin-top:0">Sign in to read and join reader conversations.</p><button class="btn" data-page="Profile">Sign in</button></div>`;
 const {data,error}=await supabase.from('discussions').select('id,body,parent_id,created_at,user_id,author:profiles!discussions_user_profile_fk(display_name)').order('created_at',{ascending:false}).limit(200);
 const list=error?`<div class="meta">${esc(error.message)}</div>`:thread(data||[],'discussion')||'<div class="empty">No conversations yet. Start the first one!</div>';
 return `${intro}<div class="panel"><h3 style="font-family:Georgia,serif;margin-top:0">Start a discussion</h3>${replyBar('discussion')}<textarea class="field" id="discussion-input" rows="3" maxlength="3000" placeholder="Which character are we defending today?"></textarea><button class="btn" id="post-discussion">Post</button></div><div class="sectionhead"><h2>Reader conversations</h2></div><div class="panel">${list}</div>`;
}
async function updates(){
 const intro=head('Updates','New chapters and announcements from Dionce Creativity.');
 if(!supabase)return `${intro}<div class="empty">New chapters and announcements will appear here once the site is connected.</div>`;
 const [{data:news},{data:chapters}]=await Promise.all([
  supabase.from('announcements').select('id,title,body,published_at').not('published_at','is',null).order('published_at',{ascending:false}).limit(20),
  supabase.from('chapters').select('chapter_number,title,published_at,book_id,books(title)').eq('is_published',true).order('published_at',{ascending:false}).limit(15)
 ]);
 const items=[...(news||[]).map(a=>({at:a.published_at,html:`<div class="row" style="align-items:flex-start"><span style="font-size:20px">📣</span><div class="grow"><b>${esc(a.title)}</b> <span class="meta">${ago(a.published_at)}</span><div style="font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:4px">${esc(a.body)}</div></div></div>`})),
  ...(chapters||[]).filter(c=>c.books&&findBook(c.book_id)).map(c=>({at:c.published_at,html:`<button class="row" data-read="${c.book_id}" data-chapter="${c.chapter_number}" style="width:100%;border:0;border-bottom:1px solid var(--line);background:white;text-align:left"><span style="font-size:20px">📖</span><span class="grow"><b>New: ${chapterLabel(c.chapter_number,c.title)}</b><div class="meta">${esc(c.books.title)} · ${ago(c.published_at)}</div></span><span style="color:var(--purple)">→</span></button>`}))
 ].sort((a,b)=>new Date(b.at)-new Date(a.at));
 return `${intro}<div class="panel">${items.map(i=>i.html).join('')||'<div class="meta">Nothing new yet. Check back soon!</div>'}</div>`;
}
async function profilePage(){
 const intro=head('Your profile','Your own little corner of Dionce Creativity.');
 if(recovering)return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Choose a new password</h2><div class="fieldlabel">New password</div><input class="field" id="new-password" type="password" autocomplete="new-password" placeholder="At least 8 characters"><button class="btn" id="update-password">Save new password</button></div>`;
 const shelf=`<div class="sectionhead"><h2>Your shelf</h2></div><div class="grid">${books.filter(b=>saved.includes(String(b.id))).map(card).join('')||'<div class="meta">No saved stories yet.</div>'}</div>`;
 if(user)return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Your reader account</h2><p class="meta">${esc(user.email)}${isAdmin()?' · Site owner':''}</p><div class="fieldlabel">Display name (shown on your comments)</div><input class="field" id="display-name" maxlength="60" value="${esc(profile?.display_name||'')}"><div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn" id="save-profile">Save</button>${isAdmin()?'<button class="btn secondary" data-page="Admin">Author dashboard</button>':''}<button class="btn secondary" id="signout">Sign out</button></div></div>${shelf}`;
 return `${intro}<div class="panel"><h2 style="font-family:Georgia,serif;margin-top:0">Welcome, reader</h2><p class="sub">Create an account to save your reading progress across devices and join discussions.</p>${supabaseReady?'':'<div class="notice">Accounts are not active yet. Add the Supabase project settings to config.js and run the setup SQL.</div>'}<div class="fieldlabel">Email</div><input class="field" id="auth-email" type="email" autocomplete="email" placeholder="you@example.com"><div class="fieldlabel">Password</div><input class="field" id="auth-password" type="password" autocomplete="current-password" placeholder="At least 8 characters"><div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center"><button class="btn" id="signup">Create account</button><button class="btn secondary" id="signin">Sign in</button><button class="linkbtn" id="forgot-password">Forgot password?</button></div></div>${shelf}`;
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
 const pages={Home:home,Library:library,Detail:detail,Reader:reader,Community:community,Updates:updates,Profile:profilePage,Admin:admin};
 const content=await (pages[page]||home)();
 if(id!==renderId)return; // a newer render started while this one was loading
 updateNav();$('main').innerHTML=content;
 if(page==='Reader')loadComments();
}
const go=async p=>{page=p;replyTo=null;await render();window.scrollTo(0,0)};

// ---------- Events ----------
document.addEventListener('click',async e=>{const t=e.target.closest('button');if(!t||t.disabled)return;const d=t.dataset;
 // Two-tap confirmation for destructive buttons (the viewer can't rely on confirm()).
 if(t.hasAttribute('data-confirm')&&d.armed!=='1'){d.armed='1';d.label=t.textContent;t.textContent='Tap again to confirm';setTimeout(()=>{if(t.isConnected&&d.armed==='1'){d.armed='';t.textContent=d.label}},4000);return}
 if(d.page){if(d.page==='Admin')resetAdminView();await go(d.page);return}
 if(d.open){selected=d.open;await go('Detail');return}
 if(d.filter){filter=d.filter;render();return}
 if(d.read){selected=d.read;readChapter=Number(d.chapter||1);await go('Reader');return}
 if(d.reply){replyTo={id:d.reply,name:d.replyName,kind:d.replyKind};const bar=$(`${d.replyKind}-reply-to`);if(bar){bar.hidden=false;bar.querySelector('b').textContent=d.replyName}$(`${d.replyKind}-input`)?.focus();return}
 if(d.deleteComment||d.deleteDiscussion){const table=d.deleteComment?'comments':'discussions';const {error}=await supabase.from(table).delete().eq('id',d.deleteComment||d.deleteDiscussion);toast(error?error.message:'Deleted.');if(d.deleteComment)loadComments();else render();return}
 if(page==='Admin'&&user&&isAdmin()&&await handleAdminClick(t,adminCtx()))return;
 switch(t.id){
 case'save-book':await toggleSave(selected);render();toast('Your shelf has been updated.');break;
 case'font-up':case'font-down':fontSize=t.id==='font-up'?Math.min(29,fontSize+2):Math.max(15,fontSize-2);if($('reader-text'))$('reader-text').style.fontSize=`${fontSize}px`;break;
 case'next-chapter':case'prev-chapter':{if(!readerState)break;const next=readerState.list[readerState.index+(t.id==='next-chapter'?1:-1)];if(next){readChapter=next.chapter_number;await go('Reader')}break}
 case'cancel-reply':{const kind=replyTo?.kind;replyTo=null;if(kind)$(`${kind}-reply-to`).hidden=true;break}
 case'signup':case'signin':{if(!supabase){toast('Connect Supabase first — see SETUP.md.');break}let email=$('auth-email').value.trim(),password=$('auth-password').value;if(!email||password.length<8){toast('Enter a valid email and a password of at least 8 characters.');break}t.disabled=true;let result=t.id==='signup'?await supabase.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await supabase.auth.signInWithPassword({email,password});t.disabled=false;if(result.error){toast(result.error.message);break}await loadUser();toast(t.id==='signup'&&!result.data.session?'Account created. Check your email to confirm it, then sign in.':'You are signed in.');render();break}
 case'forgot-password':{if(!supabase){toast('Connect Supabase first — see SETUP.md.');break}const email=$('auth-email').value.trim();if(!email){toast('Enter your email above first.');break}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});toast(error?error.message:'If that email has an account, a reset link is on its way.');break}
 case'update-password':{const password=$('new-password').value;if(password.length<8){toast('Use at least 8 characters.');break}const {error}=await supabase.auth.updateUser({password});if(error){toast(error.message);break}recovering=false;toast('Password updated.');render();break}
 case'save-profile':{const display_name=$('display-name').value.trim();if(!display_name){toast('Display name cannot be empty.');break}const {error}=await supabase.from('profiles').update({display_name}).eq('id',user.id);if(error){toast(error.message);break}profile={...profile,display_name};toast('Profile saved.');updateNav();break}
 case'signout':await supabase?.auth.signOut();user=null;profile=null;saved=[];progress={};lsSet('dc_saved',saved);lsSet('dc_progress',progress);go('Profile');break;
 case'post-comment':case'post-discussion':{
  const kind=t.id==='post-comment'?'comment':'discussion',input=$(`${kind}-input`),text=input?.value.trim();
  if(!text){toast('Write something first.');break}
  if(!supabase||!user){toast('Sign in to post.');break}
  if(kind==='comment'&&!isDb(readerState?.entry.id)){toast('Comments open on published chapters.');break}
  t.disabled=true;
  const row={user_id:user.id,body:text,parent_id:replyTo?.kind===kind?replyTo.id:null};
  if(kind==='comment')row.chapter_id=readerState.entry.id;
  const {error}=await supabase.from(kind==='comment'?'comments':'discussions').insert(row);
  t.disabled=false;if(error){toast(error.message);break}
  input.value='';replyTo=null;toast('Posted.');
  if(kind==='comment'){$('comment-reply-to').hidden=true;loadComments()}else render();
  break}
 }
});
$('search').addEventListener('input',e=>{query=e.target.value;if(page!=='Library'){page='Library';filter='All'}render()});
initAdmin();
if(supabase){supabase.auth.onAuthStateChange((event,session)=>{
 // Defer: calling Supabase inside this callback can deadlock the auth client.
 setTimeout(async()=>{
  if(event==='PASSWORD_RECOVERY'){recovering=true;page='Profile';await loadUser();render();return}
  if((session?.user?.id||null)!==(user?.id||null)){await loadUser();render()}
 },0);
})}
await loadUser();await loadBooks();if(!selected&&books[0])selected=books[0].id;render();
