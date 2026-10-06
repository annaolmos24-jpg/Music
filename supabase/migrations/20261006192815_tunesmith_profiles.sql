-- Applied to the Supabase project on 2026-10-06 (migration "tunesmith_profiles").
-- Profiles for Tunesmith (music app) users
create table public.tunesmith_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  bio text check (char_length(bio) <= 280),
  avatar_url text check (char_length(avatar_url) <= 500),
  favorite_genres text[] not null default '{}' check (cardinality(favorite_genres) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tunesmith_profiles enable row level security;

create policy "Users can view their own profile"
  on public.tunesmith_profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can create their own profile"
  on public.tunesmith_profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.tunesmith_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Keep updated_at fresh
create or replace function public.tunesmith_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tunesmith_profiles_updated_at
  before update on public.tunesmith_profiles
  for each row execute function public.tunesmith_touch_updated_at();

-- Create an empty profile automatically for every new account
create or replace function public.tunesmith_handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tunesmith_profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.tunesmith_handle_new_user() from public, anon, authenticated;

create trigger tunesmith_on_auth_user_created
  after insert on auth.users
  for each row execute function public.tunesmith_handle_new_user();

-- Backfill profiles for existing accounts
insert into public.tunesmith_profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- Profile pictures: public bucket, each user writes only inside their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tunesmith-avatars', 'tunesmith-avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "Tunesmith users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tunesmith-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Tunesmith users can update their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'tunesmith-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Tunesmith users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tunesmith-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Tunesmith users can read their own avatar files"
  on storage.objects for select to authenticated
  using (bucket_id = 'tunesmith-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
