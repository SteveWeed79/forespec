-- Team-scoped access done correctly: a row is visible/writable only if the authenticated
-- user is a member of that row's team, checked against the server-verified auth.uid() for
-- every operation. A legitimate pattern that is NOT the literal `auth.uid() = user_id` — a
-- too-strict rubric must not flag this as unscoped.
alter table projects enable row level security;

create policy "team members read" on projects
  for select using (
    exists (select 1 from memberships m where m.team_id = projects.team_id and m.user_id = auth.uid())
  );

create policy "team members write" on projects
  for all using (
    exists (select 1 from memberships m where m.team_id = projects.team_id and m.user_id = auth.uid())
  ) with check (
    exists (select 1 from memberships m where m.team_id = projects.team_id and m.user_id = auth.uid())
  );
