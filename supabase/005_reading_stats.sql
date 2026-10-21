-- Dionce Creativity: read counts for chapters and books, comment counts for chapters.
-- Run in Supabase Dashboard > SQL Editor AFTER 004_signin_to_read.sql. Safe to re-run.
--
-- How reads are counted (the same model Wattpad-style platforms use):
--   * A chapter read = one reader opening that chapter. Rereads count again, but the same reader
--     on the same chapter counts at most once per hour, so refreshing or flipping back doesn't inflate it.
--   * A book's reads = the total of its chapters' reads (30 chapters read = 30 book reads; read twice = 60).
--   * Signed-out readers count on the chapters they can open. The site owner's own reads don't count.

alter table public.books    add column if not exists reads_count    bigint  not null default 0;
alter table public.chapters add column if not exists reads_count    bigint  not null default 0;
alter table public.chapters add column if not exists comments_count integer not null default 0;

-- Private log of reads, used only to stop double counting. Nobody but the owner can see it.
create table if not exists public.chapter_reads (
  id bigint generated always as identity primary key,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  reader_key text not null,                         -- signed-in user id, or an anonymous browser id
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists chapter_reads_dedupe_idx on public.chapter_reads (chapter_id, reader_key, created_at desc);
alter table public.chapter_reads enable row level security;
drop policy if exists "owner can see the read log" on public.chapter_reads;
create policy "owner can see the read log" on public.chapter_reads for select to authenticated using (public.is_admin());
-- No insert/update/delete policies: reads are only written by record_read() below.

-- Called by the app after a reader has spent a few seconds on a chapter. Returns true when the read counted.
create or replace function public.record_read(p_chapter uuid, p_visitor uuid default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_book uuid; v_number integer; v_key text;
begin
  if public.is_admin() then return false; end if; -- the author previewing their own work
  select c.book_id, c.chapter_number into v_book, v_number
    from public.chapters c join public.books b on b.id = c.book_id
   where c.id = p_chapter and c.is_published and b.is_published;
  if v_book is null then return false; end if;
  -- Same rule as reading: chapters past the free ones only count for signed-in readers.
  if auth.uid() is null and not public.is_free_chapter(v_book, v_number) then return false; end if;
  v_key := coalesce(auth.uid()::text, 'visitor:' || p_visitor::text);
  if v_key is null then return false; end if;
  if exists (select 1 from public.chapter_reads
              where chapter_id = p_chapter and reader_key = v_key and created_at > now() - interval '1 hour') then
    return false;
  end if;
  insert into public.chapter_reads (chapter_id, reader_key, user_id) values (p_chapter, v_key, auth.uid());
  update public.chapters set reads_count = reads_count + 1 where id = p_chapter; -- book total follows via trigger
  return true;
end;
$$;
revoke all on function public.record_read(uuid, uuid) from public;
grant execute on function public.record_read(uuid, uuid) to anon, authenticated;

-- Book counters: published chapters, and reads = sum of all its chapters' reads.
create or replace function public.refresh_chapters_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.books b
     set chapters_count = (select count(*) from public.chapters c where c.book_id = b.id and c.is_published),
         reads_count    = (select coalesce(sum(c.reads_count), 0) from public.chapters c where c.book_id = b.id)
   where b.id in (coalesce(new.book_id, old.book_id), coalesce(old.book_id, new.book_id));
  return null;
end;
$$;

-- Chapter comment counts (top-level comments and replies).
create or replace function public.refresh_comments_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chapters ch
     set comments_count = (select count(*) from public.comments c where c.chapter_id = ch.id)
   where ch.id in (coalesce(new.chapter_id, old.chapter_id), coalesce(old.chapter_id, new.chapter_id));
  return null;
end;
$$;
drop trigger if exists comments_count_sync on public.comments;
create trigger comments_count_sync after insert or delete on public.comments for each row execute procedure public.refresh_comments_count();

-- Counter changes alone shouldn't change "last updated" times.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
declare counters text[] := array['updated_at','reads_count','comments_count','chapters_count'];
begin
  if (to_jsonb(new) - counters) is distinct from (to_jsonb(old) - counters) then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$$;

-- Table of contents view now carries the counts (new columns go at the end).
create or replace view public.chapter_index as
select c.id, c.book_id, c.chapter_number, c.title, c.published_at,
       row_number() over (partition by c.book_id order by c.chapter_number) <= public.free_chapter_count() as is_free,
       c.reads_count, c.comments_count
  from public.chapters c
  join public.books b on b.id = c.book_id
 where c.is_published and b.is_published;
grant select on public.chapter_index to anon, authenticated;

-- Bring existing rows in line.
update public.chapters ch set comments_count = (select count(*) from public.comments c where c.chapter_id = ch.id);
update public.books b set reads_count = (select coalesce(sum(c.reads_count), 0) from public.chapters c where c.book_id = b.id);
