// Author dashboard: books, chapters, covers. (Updates/announcements are managed on the Updates page in app.js.)
// app.js checks that the viewer is a signed-in admin before calling into this module;
// Row Level Security in Supabase enforces the same rule on every write.

// view: 'list' | 'book' | 'chapter'. bookId is null for a new book.
let view='list',bookId=null,chapterId=null,slugTouched=false;
const GENRES=['Romance','Drama','Fantasy','Thriller','Other'];
const slugify=s=>String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);
const fmtReads=n=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(n)||0);
const confirmBtn=(label,attrs)=>`<button class="btn secondary small" data-confirm ${attrs}>${label}</button>`;

export function resetAdminView(){view='list';bookId=null;chapterId=null}

export async function renderAdmin(ctx){
 if(view==='book')return bookView(ctx);
 if(view==='chapter')return chapterView(ctx);
 return listView(ctx);
}

async function listView({supabase,esc,head}){
 const {data:books,error}=await supabase.from('books').select('*').order('created_at',{ascending:false});
 const rows=error?`<p class="meta">${esc(error.message)}</p>`:(books||[]).map(b=>`<div class="row"><img src="${esc(b.cover_url||'assets/dc-logo.jpg')}" alt="" style="width:42px;aspect-ratio:3/4;object-fit:cover;border-radius:6px"><div class="grow"><b>${esc(b.title)}</b><div class="meta">${esc(b.status)} · ${b.chapters_count} published chapters · ${fmtReads(b.reads_count)} reads · ${b.is_published?'Visible to readers':'Draft (hidden)'}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn secondary small" data-admin-book="${b.id}">Edit</button><button class="btn secondary small" data-admin-toggle-book="${b.id}" data-published="${b.is_published}">${b.is_published?'Unpublish':'Publish'}</button>${confirmBtn('Delete',`data-admin-delete-book="${b.id}"`)}</div></div>`).join('')||'<div class="empty">No books yet. Add your first one.</div>';
 return `${head('Author dashboard','Your stories, your publishing schedule, your rules.')}<div class="sectionhead"><h2>Your books</h2><button class="btn small" data-admin-book="new">＋ New book</button></div><div class="panel">${rows}</div><p class="meta" style="margin-top:16px">Announcements now live on the <button class="linkbtn" data-page="Updates">Updates page</button>, where you can post, edit and publish them.</p>`;
}

async function bookView({supabase,esc,head}){
 let b={title:'',slug:'',description:'',genre:'Romance',status:'ongoing',cover_url:''},chapters=[];
 if(bookId){
  const [{data,error},{data:ch}]=await Promise.all([
   supabase.from('books').select('*').eq('id',bookId).maybeSingle(),
   supabase.from('chapters').select('id,chapter_number,title,is_published,updated_at').eq('book_id',bookId).order('chapter_number')
  ]);
  if(error||!data){view='list';return `<div class="notice">${esc(error?.message||'That book no longer exists.')}</div><button class="btn secondary" data-admin-back>← Back to dashboard</button>`}
  b=data;chapters=ch||[];
 }
 slugTouched=!!bookId;
 const chapterRows=chapters.map((c,i)=>`<div class="row"><span class="meta">${String(c.chapter_number).padStart(2,'0')}</span><div class="grow"><b style="font-size:13px">${esc(c.title)}</b><div class="meta">${c.is_published?'Published':'Draft'}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn secondary small" data-admin-chapter="${c.id}">Edit</button><button class="btn secondary small" data-admin-move="${c.id}" data-with="${chapters[i-1]?.id||''}" ${i===0?'disabled':''} aria-label="Move up">↑</button><button class="btn secondary small" data-admin-move="${c.id}" data-with="${chapters[i+1]?.id||''}" ${i===chapters.length-1?'disabled':''} aria-label="Move down">↓</button><button class="btn secondary small" data-admin-toggle-chapter="${c.id}" data-published="${c.is_published}">${c.is_published?'Unpublish':'Publish'}</button>${confirmBtn('Delete',`data-admin-delete-chapter="${c.id}"`)}</div></div>`).join('')||'<div class="meta">No chapters yet.</div>';
 const publishBar=!bookId?'':b.is_published?`<div class="notice" style="background:#e6f6ea;color:#22582f;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>This book is published. Readers can see it and its published chapters.</span><button class="btn secondary small" data-admin-toggle-book="${b.id}" data-published="true">Unpublish book</button></div>`:`<div class="notice" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>This book is a draft. Readers can't see it, or any of its chapters, until you publish it.</span><button class="btn small" data-admin-toggle-book="${b.id}" data-published="false">Publish book</button></div>`;
 return `<button class="linkbtn" data-admin-back>← Back to dashboard</button>${head(bookId?esc(b.title):'New book',bookId?'':'Fill in the details, then add chapters.')}${publishBar}<div class="panel"><div style="display:grid;grid-template-columns:120px minmax(0,1fr);gap:18px;align-items:start" class="book-form"><div><img id="cover-preview" src="${esc(b.cover_url||'assets/dc-logo.jpg')}" alt="Cover preview" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;border:1px solid var(--line)"><label class="fieldlabel" for="cover-file" style="display:block;margin-top:8px">Cover image</label><input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp" style="font-size:11px;max-width:100%"><div class="meta">JPG, PNG or WebP, up to 5 MB.</div></div><div style="min-width:0"><label class="fieldlabel">Book title</label><input id="book-title" class="field" maxlength="200" value="${esc(b.title)}" placeholder="Book title"><label class="fieldlabel">Web address name (slug)</label><input id="book-slug" class="field" maxlength="80" value="${esc(b.slug)}" placeholder="my-book-title"><label class="fieldlabel">Description</label><textarea id="book-desc" class="field" rows="4" placeholder="A short description">${esc(b.description||'')}</textarea><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="fieldlabel">Genre</label><select id="book-genre" class="field">${GENRES.map(g=>`<option ${g===b.genre?'selected':''}>${g}</option>`).join('')}</select></div><div><label class="fieldlabel">Story status</label><select id="book-status" class="field"><option value="ongoing" ${b.status==='ongoing'?'selected':''}>Ongoing</option><option value="completed" ${b.status==='completed'?'selected':''}>Completed</option></select></div></div><button class="btn" id="save-book-details">${bookId?'Save changes':'Create draft book'}</button></div></div></div>${bookId?`<div class="sectionhead"><h2>Chapters</h2><button class="btn small" id="add-chapter">＋ Add chapter</button></div><div class="panel">${chapterRows}</div><p class="meta">Readers only see published chapters, and only once the book itself is published.</p>`:''}`;
}

async function chapterView({supabase,esc,head}){
 const {data:c,error}=await supabase.from('chapters').select('id,book_id,chapter_number,title,body,is_published,books(title,is_published)').eq('id',chapterId).maybeSingle();
 if(error||!c){view='book';return `<div class="notice">${esc(error?.message||'That chapter no longer exists.')}</div><button class="btn secondary" data-admin-book="${bookId}">← Back to book</button>`}
 const words=c.body.trim()?c.body.trim().split(/\s+/).length:0;
 return `<button class="linkbtn" data-admin-book="${c.book_id}">← Back to ${esc(c.books?.title||'book')}</button>${head(`Chapter ${c.chapter_number}`,c.is_published?'Published: readers can see this chapter.':'Draft: readers cannot see this chapter yet.')}<div class="panel"><label class="fieldlabel">Chapter title</label><input id="chapter-title" class="field" maxlength="200" value="${esc(c.title)}"><label class="fieldlabel">Chapter text <span class="meta" id="word-count">${words} words</span></label><textarea id="chapter-body" class="field" rows="22" style="font:16px/1.7 Georgia,serif" placeholder="Write or paste your chapter here. Leave a blank line between paragraphs.">${esc(c.body)}</textarea>${!c.is_published&&!c.books?.is_published?'<div class="notice">This book is still a draft, so <b>Save &amp; publish</b> will publish the book too. Use <b>Save</b> to keep both private.</div>':''}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn secondary" id="save-chapter" data-publish="keep">Save</button><button class="btn" id="save-chapter-publish" data-publish="${c.is_published?'false':'true'}" data-book="${c.book_id}" data-book-published="${!!c.books?.is_published}">${c.is_published?'Save & unpublish':'Save & publish'}</button></div></div>`;
}

// Live helpers for the forms: slug auto-fill, cover preview, word count.
export function initAdmin(){
 document.addEventListener('input',e=>{
  if(e.target.id==='book-slug')slugTouched=true;
  if(e.target.id==='book-title'&&!slugTouched){const s=document.getElementById('book-slug');if(s)s.value=slugify(e.target.value)}
  if(e.target.id==='chapter-body'){const w=e.target.value.trim()?e.target.value.trim().split(/\s+/).length:0;const el=document.getElementById('word-count');if(el)el.textContent=`${w} words`}
 });
 document.addEventListener('change',e=>{
  if(e.target.id!=='cover-file')return;const f=e.target.files?.[0],p=document.getElementById('cover-preview');
  if(f&&p)p.src=URL.createObjectURL(f);
 });
}

async function uploadCover(supabase,file,id){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Cover must be a JPG, PNG or WebP image.');
 if(file.size>5*1024*1024)throw new Error('Cover image must be 5 MB or smaller.');
 const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
 const path=`${id}/${Date.now()}.${ext}`;
 const {error}=await supabase.storage.from('covers').upload(path,file,{contentType:file.type,cacheControl:'31536000'});
 if(error)throw error;
 return supabase.storage.from('covers').getPublicUrl(path).data.publicUrl;
}

// Returns true when the click belonged to the dashboard. ctx.refresh() re-renders the page and reloads reader data.
export async function handleAdminClick(t,ctx){
 const {supabase,user,toast,$,refresh}=ctx,d=t.dataset;
 if(d.adminBack!==undefined){resetAdminView();await refresh(false);return true}
 if(d.adminBook){view='book';bookId=d.adminBook==='new'?null:d.adminBook;await refresh(false);window.scrollTo(0,0);return true}
 if(d.adminChapter){view='chapter';chapterId=d.adminChapter;await refresh(false);window.scrollTo(0,0);return true}
 if(d.adminToggleBook){const publish=d.published!=='true';const {error}=await supabase.from('books').update({is_published:publish}).eq('id',d.adminToggleBook);toast(error?error.message:publish?'Book published.':'Book unpublished.');await refresh(true);return true}
 if(d.adminDeleteBook){const {error}=await supabase.from('books').delete().eq('id',d.adminDeleteBook);toast(error?error.message:'Book deleted.');resetAdminView();await refresh(true);return true}
 if(d.adminToggleChapter){const publish=d.published!=='true';const {error}=await supabase.from('chapters').update({is_published:publish}).eq('id',d.adminToggleChapter);toast(error?error.message:publish?'Chapter published.':'Chapter unpublished.');await refresh(true);return true}
 if(d.adminDeleteChapter){const {error}=await supabase.from('chapters').delete().eq('id',d.adminDeleteChapter);toast(error?error.message:'Chapter deleted.');await refresh(true);return true}
 if(d.adminMove){if(!d.with)return true;const {error}=await supabase.rpc('swap_chapter_numbers',{a:d.adminMove,b:d.with});if(error)toast(error.message);await refresh(true);return true}
 switch(t.id){
  case'save-book-details':{
   const title=$('book-title').value.trim(),slug=slugify($('book-slug').value||title),description=$('book-desc').value.trim(),genre=$('book-genre').value,status=$('book-status').value,file=$('cover-file').files?.[0];
   if(!title||!slug){toast('Add a title first.');return true}
   t.disabled=true;t.textContent='Saving…';
   try{
    const id=bookId||crypto.randomUUID(),row={title,slug,description,genre,status};
    if(file)row.cover_url=await uploadCover(supabase,file,id);
    const {error}=bookId?await supabase.from('books').update(row).eq('id',id):await supabase.from('books').insert({...row,id,author_id:user.id,is_published:false});
    if(error)throw error.code==='23505'?new Error('Another book already uses that web address name. Choose a different slug.'):error;
    toast(bookId?'Book saved.':'Draft book created. Now add chapters.');bookId=id;view='book';await refresh(true);
   }catch(err){toast(err.message);t.disabled=false;t.textContent=bookId?'Save changes':'Create draft book'}
   return true}
  case'add-chapter':{
   const {data:last}=await supabase.from('chapters').select('chapter_number').eq('book_id',bookId).order('chapter_number',{ascending:false}).limit(1).maybeSingle();
   const n=(last?.chapter_number||0)+1;
   const {data,error}=await supabase.from('chapters').insert({book_id:bookId,chapter_number:n,title:`Chapter ${n}`,body:''}).select('id').single();
   if(error){toast(error.message);return true}
   view='chapter';chapterId=data.id;await refresh(false);return true}
  case'save-chapter':case'save-chapter-publish':{
   const row={title:$('chapter-title').value.trim()||'Chapter',body:$('chapter-body').value};
   if(d.publish!=='keep')row.is_published=d.publish==='true';
   if(row.is_published&&!row.body.trim()){toast('Add some text before publishing this chapter.');return true}
   t.disabled=true;
   // .select() returns the updated rows: an empty result means the database refused the change (e.g. an expired login).
   const {data:saved,error}=await supabase.from('chapters').update(row).eq('id',chapterId).select('id');
   if(error||!saved?.length){toast(error?.message||'Nothing was saved. Please sign out, sign back in, and try again.');t.disabled=false;return true}
   // Publishing a chapter of a draft book publishes the book too, so the chapter is actually visible to readers.
   if(row.is_published&&d.bookPublished!=='true'){
    const {data:pub,error:e2}=await supabase.from('books').update({is_published:true}).eq('id',d.book).select('id');
    if(e2||!pub?.length){toast(`Chapter published, but the book could not be published: ${e2?.message||'please try again from the book page.'}`);t.disabled=false;return true}
   }
   // Plain Save keeps you in the editor; publishing or unpublishing returns to the dashboard.
   if(row.is_published===undefined)toast('Chapter saved.');
   else{
    toast(row.is_published?(d.bookPublished==='true'?'Chapter published. Readers can see it now.':'Chapter and book published. Readers can see them now.'):'Chapter unpublished.');
    resetAdminView();window.scrollTo(0,0);
   }
   await refresh(true);return true}
 }
 return false;
}
