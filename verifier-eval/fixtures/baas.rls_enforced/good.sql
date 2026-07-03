-- Supabase schema. RLS is enabled on the user-data table and every policy scopes
-- rows to the authenticated user, so the anon key can only ever touch its own rows.

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  body text
);

alter table notes enable row level security;

create policy "own notes select" on notes
  for select using (auth.uid() = user_id);

create policy "own notes insert" on notes
  for insert with check (auth.uid() = user_id);

create policy "own notes update" on notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own notes delete" on notes
  for delete using (auth.uid() = user_id);
