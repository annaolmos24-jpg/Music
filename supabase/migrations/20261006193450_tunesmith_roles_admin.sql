-- Applied 2026-10-06 (migration "tunesmith_roles_admin")
-- Roles ---------------------------------------------------------------
create type public.tunesmith_role as enum ('admin', 'employee', 'user');

alter table public.tunesmith_profiles
  add column role public.tunesmith_role not null default 'user';

-- Users may edit their own profile, but never their role.
revoke insert, update on public.tunesmith_profiles from anon, authenticated;
grant insert (id, username, display_name, bio, avatar_url, favorite_genres) on public.tunesmith_profiles to authenticated;
grant update (username, display_name, bio, avatar_url, favorite_genres) on public.tunesmith_profiles to authenticated;

-- Role helpers (security definer so policies can use them without recursion)
create or replace function public.tunesmith_current_role()
returns public.tunesmith_role language sql stable security definer set search_path = '' as $$
  select role from public.tunesmith_profiles where id = (select auth.uid());
$$;

create or replace function public.tunesmith_is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'employee') from public.tunesmith_profiles where id = (select auth.uid())), false);
$$;

create or replace function public.tunesmith_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.tunesmith_profiles where id = (select auth.uid())), false);
$$;

revoke execute on function public.tunesmith_current_role(), public.tunesmith_is_staff(), public.tunesmith_is_admin() from public, anon;
grant execute on function public.tunesmith_current_role(), public.tunesmith_is_staff(), public.tunesmith_is_admin() to authenticated;

-- Admins and employees can see every profile
create policy "Staff can view all profiles"
  on public.tunesmith_profiles for select to authenticated
  using ((select public.tunesmith_is_staff()));

-- Site activity (for monitoring) ---------------------------------------
create table public.tunesmith_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  detail jsonb not null default '{}' check (pg_column_size(detail) <= 2000),
  created_at timestamptz not null default now()
);
create index tunesmith_events_created_at_idx on public.tunesmith_events (created_at desc);
create index tunesmith_events_user_id_idx on public.tunesmith_events (user_id);

alter table public.tunesmith_events enable row level security;
revoke all on public.tunesmith_events from anon;

create policy "Users can log their own activity"
  on public.tunesmith_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users see their own activity, staff see all"
  on public.tunesmith_events for select to authenticated
  using ((select auth.uid()) = user_id or (select public.tunesmith_is_staff()));

-- Admin action history (written only by the admin edge function) --------
create table public.tunesmith_admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_id uuid,
  target_email text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index tunesmith_admin_audit_created_at_idx on public.tunesmith_admin_audit (created_at desc);
create index tunesmith_admin_audit_actor_id_idx on public.tunesmith_admin_audit (actor_id);

alter table public.tunesmith_admin_audit enable row level security;
revoke all on public.tunesmith_admin_audit from anon;
revoke insert, update, delete on public.tunesmith_admin_audit from authenticated;

create policy "Admins can read the audit log"
  on public.tunesmith_admin_audit for select to authenticated
  using ((select public.tunesmith_is_admin()));

-- Database health for the admin console --------------------------------
create or replace function public.tunesmith_db_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.tunesmith_is_staff() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'version', current_setting('server_version'),
    'size_bytes', pg_database_size(current_database()),
    'connections', (select count(*) from pg_catalog.pg_stat_activity where datname = current_database()),
    'max_connections', current_setting('max_connections')::int,
    'started_at', pg_catalog.pg_postmaster_start_time(),
    'server_time', now(),
    'tables', (select coalesce(jsonb_object_agg(relname, n_live_tup), '{}'::jsonb)
               from pg_catalog.pg_stat_user_tables where schemaname = 'public')
  );
end;
$$;
revoke execute on function public.tunesmith_db_stats() from public, anon;
grant execute on function public.tunesmith_db_stats() to authenticated;

-- Make the site owner an administrator
update public.tunesmith_profiles set role = 'admin'
where id = (select id from auth.users where email = 'annaolmos24@gmail.com');
