-- Applied 2026-10-06 (migration "tunesmith_private_helpers_1").
-- Groundwork for moving role helpers out of the public API schema. Not yet used by
-- any policy; the follow-up that switches policies over is still pending.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.tunesmith_is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin', 'employee') from public.tunesmith_profiles where id = (select auth.uid())), false);
$$;

create or replace function private.tunesmith_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.tunesmith_profiles where id = (select auth.uid())), false);
$$;

revoke execute on function private.tunesmith_is_staff(), private.tunesmith_is_admin() from public, anon;
grant execute on function private.tunesmith_is_staff(), private.tunesmith_is_admin() to authenticated;
