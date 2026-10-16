-- Dionce Creativity MVP schema for Supabase
-- Run in Supabase Dashboard > SQL Editor.
-- Reader access is restricted to published books/chapters.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  role text not null default 'reader' check (role in ('reader','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  slug text not null unique,
  description text,
  genre text not null default 'Romance',
  cover_url text,
  status text not null default 'draft' check (status in ('draft','ongoing','completed','published')),
  is_published boolean not null default false,
  chapters_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  title text not null default 'Chapter',
  body text not null default '',
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_id, chapter_number)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  parent_id uuid references public.comments(id) on delete cascade,
  passage_quote text,
  passage_start integer,
  passage_end integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key(user_id, book_id)
);

create table if not exists public.library_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, book_id)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

-- Create a reader profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, username, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1) || '_' || substr(new.id::text,1,5)),
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.chapters enable row level security;
alter table public.comments enable row level security;
alter table public.reading_progress enable row level security;
alter table public.library_saves enable row level security;
alter table public.announcements enable row level security;

-- Profiles: signed-in readers can read public usernames; each user updates only their own profile.
create policy "profiles readable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'reader');
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Books: published works are public; only the admin can create/edit/publish.
create policy "published books are readable" on public.books for select using (is_published = true or public.is_admin());
create policy "admin inserts books" on public.books for insert to authenticated with check (public.is_admin() and author_id = auth.uid());
create policy "admin updates books" on public.books for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes books" on public.books for delete to authenticated using (public.is_admin());

-- Chapters: only chapters of published books are visible to readers.
create policy "published chapters are readable" on public.chapters for select using (
  public.is_admin() or (is_published = true and exists(select 1 from public.books b where b.id = book_id and b.is_published = true))
);
create policy "admin inserts chapters" on public.chapters for insert to authenticated with check (public.is_admin());
create policy "admin updates chapters" on public.chapters for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes chapters" on public.chapters for delete to authenticated using (public.is_admin());

-- Comments: signed-in readers can read and create; authors/admin can moderate via admin policy.
create policy "comments visible to authenticated users" on public.comments for select to authenticated using (true);
create policy "signed in users create own comments" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "users update own comments" on public.comments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete own comments or admin" on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "users manage own progress" on public.reading_progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage own saved books" on public.library_saves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "published announcements readable" on public.announcements for select using (published_at is not null or public.is_admin());
create policy "admin creates announcements" on public.announcements for insert to authenticated with check (public.is_admin() and author_id = auth.uid());
create policy "admin updates announcements" on public.announcements for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes announcements" on public.announcements for delete to authenticated using (public.is_admin());

-- After creating your account, promote YOUR account to admin using the SQL below,
-- replacing the email. Do not expose the database service-role key.
-- update public.profiles p set role='admin'
-- from auth.users u where p.id=u.id and u.email='YOUR-LOGIN-EMAIL-HERE';
