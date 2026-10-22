-- Dionce Creativity: list of signed-up readers for the Author dashboard (owner only).
-- Run in Supabase Dashboard > SQL Editor AFTER 005_reading_stats.sql. Safe to re-run.
-- Emails live in Supabase's private auth.users table; this function hands them out only to an admin.

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  username text,
  display_name text,
  role text,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'Only the site owner can see the reader list' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, p.username, p.display_name, p.role,
           u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
