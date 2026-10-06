-- Applied 2026-10-06 (migration "tunesmith_fix_profile_upsert_grant")
-- Profile saves use upsert, which re-sends "id" in the update; allow it.
-- Row-level security still requires id = the signed-in user, and "role" stays locked.
grant update (id) on public.tunesmith_profiles to authenticated;
