-- Dionce Creativity: the first chapters of every book are free; the rest need a signed-in account.
-- Run in Supabase Dashboard > SQL Editor AFTER 003_passage_comments.sql. Safe to re-run.
-- To change how many chapters are free, edit the number in free_chapter_count() and run this file again.

create or replace function public.free_chapter_count()
returns integer language sql immutable as $$ select 2 $$;

-- True when this chapter is one of the first free_chapter_count() PUBLISHED chapters of its book.
-- security definer so the chapters policy below can count chapters without re-entering its own policy.
create or replace function public.is_free_chapter(p_book uuid, p_number integer)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from public.chapters c
           where c.book_id = p_book and c.is_published and c.chapter_number < p_number)
         < public.free_chapter_count();
$$;

-- Chapter text: free chapters for everyone, the rest only for signed-in readers. Admin sees everything.
drop policy if exists "published chapters are readable" on public.chapters;
drop policy if exists "free chapters public, the rest for signed-in readers" on public.chapters;
create policy "free chapters public, the rest for signed-in readers" on public.chapters for select using (
  public.is_admin()
  or (
    is_published
    and exists (select 1 from public.books b where b.id = book_id and b.is_published)
    and (auth.uid() is not null or public.is_free_chapter(book_id, chapter_number))
  )
);

-- Table of contents for everyone: titles and numbers only (never the text), with a flag for free chapters.
-- It runs with the view owner's rights so signed-out readers can see which chapters exist.
create or replace view public.chapter_index as
select c.id, c.book_id, c.chapter_number, c.title, c.published_at,
       row_number() over (partition by c.book_id order by c.chapter_number) <= public.free_chapter_count() as is_free
  from public.chapters c
  join public.books b on b.id = c.book_id
 where c.is_published and b.is_published;

grant select on public.chapter_index to anon, authenticated;
