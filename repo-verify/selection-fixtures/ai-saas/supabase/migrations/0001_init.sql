-- Notes table exposed directly to the client via the anon key, with a permissive RLS
-- policy — the file selection must surface for baas.rls_enforced.
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  body text
);

alter table notes enable row level security;

create policy "anyone can read" on notes for select using (true);
