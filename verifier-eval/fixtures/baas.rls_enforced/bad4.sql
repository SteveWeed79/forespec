-- Reads are correctly scoped, which passes a glance — but writes are wide open. The
-- SELECT policy checks ownership while an ALL policy authorizes every write, so any
-- authenticated user can update or delete anyone's post. Distinct: partial coverage.
alter table posts enable row level security;

create policy "read own" on posts
  for select using (auth.uid() = author_id);

create policy "write any" on posts
  for all using (true) with check (true);
