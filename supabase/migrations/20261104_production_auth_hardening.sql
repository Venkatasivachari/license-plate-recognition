-- Authenticated users must not be able to grant themselves administrator access
-- through user-editable Supabase Auth metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role, plate_number)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    'CUSTOMER',
    new.raw_user_meta_data->>'plate_number'
  );
  return new;
end;
$$;

-- A profile update policy is unnecessary for the current client and would let
-- users alter protected profile columns such as role.
drop policy if exists "users update own profile" on public.profiles;

-- Customer permission creation would let a vehicle owner bypass admin approval.
drop policy if exists "customers insert own permissions" on public.permissions;

-- Refuse to discard any legacy plaintext passwords. Back up/remediate populated
-- rows manually, then rerun this migration.
do $$
declare
  has_column boolean;
  has_password_values boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'password_reset_requests'
      and column_name = 'new_password'
  ) into has_column;

  if has_column then
    execute 'select exists (select 1 from public.password_reset_requests where new_password is not null)'
      into has_password_values;
    if has_password_values then
      raise exception 'password_reset_requests.new_password contains data; back up and securely remediate it before rerunning this migration';
    end if;
    alter table public.password_reset_requests drop column new_password;
  end if;
end
$$;

-- These writes are performed by the backend with the service-role key, which
-- bypasses RLS. Keep explicit policies restricted to that role as defense in depth.
drop policy if exists "service insert permissions" on public.permissions;
create policy "service insert permissions" on public.permissions
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service insert detections" on public.detections;
create policy "service insert detections" on public.detections
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service insert visits" on public.visits;
create policy "service insert visits" on public.visits
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service update visits" on public.visits;
create policy "service update visits" on public.visits
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service insert sessions" on public.vehicle_sessions;
create policy "service insert sessions" on public.vehicle_sessions
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service update sessions" on public.vehicle_sessions;
create policy "service update sessions" on public.vehicle_sessions
  for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "service insert evidence" on public.evidence;
create policy "service insert evidence" on public.evidence
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service insert alerts" on public.alerts;
create policy "service insert alerts" on public.alerts
  for insert with check (auth.role() = 'service_role');

drop policy if exists "service insert audit logs" on public.audit_logs;
create policy "service insert audit logs" on public.audit_logs
  for insert with check (auth.role() = 'service_role');

revoke all on function public.cleanup_old_records() from public, anon, authenticated;
grant execute on function public.cleanup_old_records() to service_role;
