-- Dionce Creativity MVP features migration
-- Run in Supabase Dashboard > SQL Editor AFTER schema.sql.
-- Safe to re-run: every statement checks whether it has already been applied.

-- ---------------------------------------------------------------------------
-- 1. Books: publishing (is_published) is separate from story status.
--    status now only describes the story: ongoing or completed.
-- ---------------------------------------------------------------------------
update public.books set status = 'ongoing' where status not in ('ongoing','completed');
alter table public.books drop constraint if exists books_status_check;
alter table public.books add constraint books_status_check check (status in ('ongoing','completed'));
alter table public.books alter column status set default 'ongoing';

-- ---------------------------------------------------------------------------
-- 2. Link user-owned rows to profiles so the app can show display names.
--    (The existing auth.users foreign keys stay in place.)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'books_author_profile_fk') then
    alter table public.books add constraint books_author_profile_fk foreign key (author_id) references public.profiles(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_user_profile_fk') then
    alter table public.comments add constraint comments_user_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- Author (admin) display names are public so signed-out readers see the byline.
drop policy if exists "author profiles are public" on public.profiles;
create policy "author profiles are public" on public.profiles for select using (role = 'admin');

-- ---------------------------------------------------------------------------
-- 3. Community discussions (top-level posts plus one level of replies).
-- ---------------------------------------------------------------------------
create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.discussions(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'discussions_user_profile_fk') then
    alter table public.discussions rename constraint discussions_user_id_fkey to discussions_user_profile_fk;
  end if;
end $$;
alter table public.discussions enable row level security;

drop policy if exists "discussions visible to authenticated users" on public.discussions;
drop policy if exists "signed in users create own discussions" on public.discussions;
drop policy if exists "users update own discussions" on public.discussions;
drop policy if exists "users delete own discussions or admin" on public.discussions;
create policy "discussions visible to authenticated users" on public.discussions for select to authenticated using (true);
create policy "signed in users create own discussions" on public.discussions for insert to authenticated with check (user_id = auth.uid());
create policy "users update own discussions" on public.discussions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own discussions or admin" on public.discussions for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Triggers: updated_at, chapter published_at, books.chapters_count.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists books_touch on public.books;
create trigger books_touch before update on public.books for each row execute procedure public.touch_updated_at();
drop trigger if exists chapters_touch on public.chapters;
create trigger chapters_touch before update on public.chapters for each row execute procedure public.touch_updated_at();
drop trigger if exists comments_touch on public.comments;
create trigger comments_touch before update on public.comments for each row execute procedure public.touch_updated_at();
drop trigger if exists discussions_touch on public.discussions;
create trigger discussions_touch before update on public.discussions for each row execute procedure public.touch_updated_at();

-- Stamp the first publish time of a chapter (used by the Updates feed).
create or replace function public.stamp_chapter_published()
returns trigger language plpgsql as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists chapters_stamp_published on public.chapters;
create trigger chapters_stamp_published before insert or update on public.chapters for each row execute procedure public.stamp_chapter_published();

-- chapters_count = number of PUBLISHED chapters, kept in sync automatically.
create or replace function public.refresh_chapters_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.books b
     set chapters_count = (select count(*) from public.chapters c where c.book_id = b.id and c.is_published)
   where b.id in (coalesce(new.book_id, old.book_id), coalesce(old.book_id, new.book_id));
  return null;
end;
$$;
drop trigger if exists chapters_count_sync on public.chapters;
create trigger chapters_count_sync after insert or update or delete on public.chapters for each row execute procedure public.refresh_chapters_count();

-- Bring existing rows in line.
update public.chapters set published_at = coalesce(published_at, updated_at) where is_published;
update public.books b set chapters_count = (select count(*) from public.chapters c where c.book_id = b.id and c.is_published);

-- ---------------------------------------------------------------------------
-- 5. Swap two chapters' numbers atomically (used by the reorder buttons).
--    Runs as the caller, so the admin-only chapter policies still apply.
-- ---------------------------------------------------------------------------
create or replace function public.swap_chapter_numbers(a uuid, b uuid)
returns void language plpgsql set search_path = public as $$
declare na integer; nb integer;
begin
  if not public.is_admin() then raise exception 'Only the site owner can reorder chapters'; end if;
  select chapter_number into na from public.chapters where id = a;
  select chapter_number into nb from public.chapters where id = b;
  if na is null or nb is null then raise exception 'Chapter not found'; end if;
  update public.chapters set chapter_number = 2000000000 where id = a;
  update public.chapters set chapter_number = na where id = b;
  update public.chapters set chapter_number = nb where id = a;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Cover image storage: public read, owner-only write. 5 MB image limit.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin uploads covers" on storage.objects;
drop policy if exists "admin updates covers" on storage.objects;
drop policy if exists "admin deletes covers" on storage.objects;
create policy "admin uploads covers" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and public.is_admin());
create policy "admin updates covers" on storage.objects for update to authenticated using (bucket_id = 'covers' and public.is_admin());
create policy "admin deletes covers" on storage.objects for delete to authenticated using (bucket_id = 'covers' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Indexes for the queries the app runs.
-- ---------------------------------------------------------------------------
create index if not exists books_published_created_idx on public.books (is_published, created_at desc);
create index if not exists chapters_published_at_idx on public.chapters (published_at desc) where is_published;
create index if not exists comments_chapter_created_idx on public.comments (chapter_id, created_at);
create index if not exists discussions_created_idx on public.discussions (created_at desc);
create index if not exists announcements_published_idx on public.announcements (published_at desc);
