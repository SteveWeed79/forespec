-- RLS is enabled, which looks safe, but the policy scopes rows by a value the CLIENT
-- controls — a request header it can set to any tenant — instead of the server-verified
-- auth.uid(). Anyone sets x-tenant-id and reads that tenant's rows.
alter table documents enable row level security;

create policy "by tenant header" on documents
  for all using (tenant_id = current_setting('request.headers.x-tenant-id', true));
