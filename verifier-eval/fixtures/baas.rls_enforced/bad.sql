-- Supabase schema. The client uses the anon key directly from the browser, so RLS
-- is the only access boundary — and here it is missing or permissive.

-- notes holds user content but RLS is never enabled: the anon key reads and writes
-- every user's rows.
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  body text
);

-- profiles "enables" RLS but the policy authorizes everyone, which is the same as no
-- protection — any user can select any other user's profile.
create table profiles (
  id uuid primary key,
  user_id uuid,
  bio text,
  phone text
);
alter table profiles enable row level security;
create policy "public read" on profiles for select using (true);
