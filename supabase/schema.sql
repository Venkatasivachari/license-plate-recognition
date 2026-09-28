create extension if not exists pgcrypto;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- ============================================================
-- PROFILES (auth user metadata)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'CUSTOMER')) default 'CUSTOMER',
  display_name text not null,
  plate_number text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- CUSTOMERS (extended profile)
-- ============================================================
create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  customer_code text unique not null,
  display_name text not null,
  email text,
  phone text,
  address text,
  house_no text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customers enable row level security;

-- ============================================================
-- VEHICLES
-- ============================================================
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null unique,
  normalized_plate text not null,
  vehicle_type text not null default 'Car',
  make text,
  model text,
  color text,
  owner_name text not null,
  owner_phone text,
  owner_email text,
  driver_name text,
  driver_phone text,
  purpose text,
  access_type text,
  status text not null default 'AUTHORIZED',
  valid_from timestamptz,
  valid_until timestamptz,
  customer_id uuid references auth.users(id) on delete set null,
  house_no text,
  customer_code text,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles enable row level security;

-- ============================================================
-- INVITATIONS
-- ============================================================
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  plate_number text not null,
  normalized_plate text not null,
  person text,
  owner_house_no text,
  vehicle_type text,
  purpose text not null default 'Guest',
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

alter table public.invitations enable row level security;

-- ============================================================
-- PERMISSIONS
-- ============================================================
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null,
  normalized_plate text not null,
  person text,
  purpose text not null default 'Visitor',
  valid_date date,
  status text not null default 'ACTIVE',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.permissions enable row level security;

-- ============================================================
-- DETECTIONS
-- ============================================================
create table if not exists public.detections (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  plate_number text not null,
  normalized_plate text not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  vehicle_type text,
  raw_ocr text,
  ocr_confidence numeric,
  yolo_confidence numeric,
  status text not null,
  decision text not null,
  purpose text,
  invitation_id uuid references public.invitations(id) on delete set null,
  camera_id text not null default 'laptop-browser-1',
  evidence_path text,
  evidence_url text,
  source text not null default 'REAL',
  detected_at timestamptz not null default now()
);

alter table public.detections enable row level security;

-- ============================================================
-- VISITS
-- ============================================================
create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null,
  normalized_plate text not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  detection_id uuid references public.detections(id) on delete set null,
  entry_time timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  exit_time timestamptz,
  duration_minutes integer,
  status text not null,
  authorization_status text not null,
  purpose text,
  source text not null default 'REAL'
);

alter table public.visits enable row level security;

-- ============================================================
-- VEHICLE SESSIONS
-- ============================================================
create table if not exists public.vehicle_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  plate_number text not null,
  normalized_plate text not null,
  session_start timestamptz not null default now(),
  session_end timestamptz,
  last_seen_at timestamptz not null default now(),
  detection_count integer not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

alter table public.vehicle_sessions enable row level security;

-- ============================================================
-- EVIDENCE
-- ============================================================
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  detection_id uuid not null references public.detections(id) on delete cascade,
  file_path text not null,
  file_url text,
  file_size integer,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.evidence enable row level security;

-- ============================================================
-- ALERTS
-- ============================================================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null,
  detection_id uuid references public.detections(id) on delete set null,
  type text not null,
  severity text not null default 'MEDIUM',
  message text not null,
  is_read boolean not null default false,
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.alerts enable row level security;

-- ============================================================
-- PASSWORD RESET REQUESTS
-- ============================================================
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  plate_number text not null,
  owner_name text not null,
  new_password text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;

-- ============================================================
-- COMPLAINTS
-- ============================================================
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  plate_number text,
  category text not null check (category in ('GATE_ISSUE', 'WRONG_DETECTION', 'OTHER')),
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
  created_at timestamptz not null default now()
);

alter table public.complaints enable row level security;

-- ============================================================
-- AUDIT LOGS
-- ============================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- ============================================================
-- SAFETY: ensure normalized_plate exists on all tables
-- (handles databases where tables were created by an older
--  schema.sql that lacked this column)
-- ============================================================
alter table public.vehicles        add column if not exists normalized_plate text not null default '';
alter table public.invitations     add column if not exists normalized_plate text not null default '';
alter table public.permissions     add column if not exists normalized_plate text not null default '';
alter table public.detections      add column if not exists normalized_plate text not null default '';
alter table public.visits          add column if not exists normalized_plate text not null default '';
alter table public.vehicle_sessions add column if not exists normalized_plate text not null default '';

-- Also ensure the status CHECK on invitations is correct (older schemas
-- may have had 'Guest' instead of the standard purpose list)
alter table public.invitations
  alter column status set default 'ACTIVE';

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_vehicles_normalized_plate on public.vehicles(normalized_plate);
create index if not exists idx_vehicles_customer_id on public.vehicles(customer_id);
create index if not exists idx_vehicles_customer_plate on public.vehicles(customer_id, normalized_plate);

create index if not exists idx_invitations_normalized_plate on public.invitations(normalized_plate);
create index if not exists idx_invitations_owner_id on public.invitations(owner_id);
create index if not exists idx_invitations_plate_window on public.invitations(normalized_plate, start_at, end_at);

create index if not exists idx_permissions_normalized_plate on public.permissions(normalized_plate);

create index if not exists idx_detections_normalized_plate on public.detections(normalized_plate);
create index if not exists idx_detections_detected_at on public.detections(detected_at desc);
create unique index if not exists detections_idempotency_key_idx on public.detections(idempotency_key) where idempotency_key is not null;

create index if not exists idx_visits_normalized_plate on public.visits(normalized_plate, entry_time desc);
create index if not exists idx_visits_active on public.visits(normalized_plate, exit_time, last_seen_at desc);

create index if not exists idx_vehicle_sessions_plate on public.vehicle_sessions(normalized_plate);
create index if not exists idx_vehicle_sessions_active on public.vehicle_sessions(status, last_seen_at desc);

create index if not exists idx_evidence_detection on public.evidence(detection_id);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'ADMIN');
$$;

-- ============================================================
-- TRIGGER: auto-create profile on auth user insert
-- ============================================================
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role, plate_number)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), coalesce(new.raw_user_meta_data->>'role', 'CUSTOMER'), new.raw_user_meta_data->>'plate_number');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- ============================================================
-- RLS POLICIES (idempotent: drop-then-create so schema.sql can
-- safely be re-run on an existing database)
-- ============================================================
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "admins manage all profiles" on public.profiles;
drop policy if exists "admins manage organizations" on public.organizations;
drop policy if exists "authenticated read organizations" on public.organizations;
drop policy if exists "admins manage all customers" on public.customers;
drop policy if exists "customers read own profile" on public.customers;
drop policy if exists "customers update own profile" on public.customers;
drop policy if exists "admins manage all vehicles" on public.vehicles;
drop policy if exists "customers read own vehicles" on public.vehicles;
drop policy if exists "admins manage invitations" on public.invitations;
drop policy if exists "customers read own invitations" on public.invitations;
drop policy if exists "customers create own invitations" on public.invitations;
drop policy if exists "admins manage permissions" on public.permissions;
drop policy if exists "service insert permissions" on public.permissions;
drop policy if exists "admins read all detections" on public.detections;
drop policy if exists "customers read own detections" on public.detections;
drop policy if exists "service insert detections" on public.detections;
drop policy if exists "admins manage all visits" on public.visits;
drop policy if exists "customers read own visits" on public.visits;
drop policy if exists "service insert visits" on public.visits;
drop policy if exists "service update visits" on public.visits;
drop policy if exists "admins manage all sessions" on public.vehicle_sessions;
drop policy if exists "customers read own vehicle sessions" on public.vehicle_sessions;
drop policy if exists "service insert sessions" on public.vehicle_sessions;
drop policy if exists "service update sessions" on public.vehicle_sessions;
drop policy if exists "admins manage all evidence" on public.evidence;
drop policy if exists "customers read own vehicle evidence" on public.evidence;
drop policy if exists "service insert evidence" on public.evidence;
drop policy if exists "admins manage alerts" on public.alerts;
drop policy if exists "customers read own alerts" on public.alerts;
drop policy if exists "service insert alerts" on public.alerts;
drop policy if exists "customers create own reset requests" on public.password_reset_requests;
drop policy if exists "customers read own reset requests" on public.password_reset_requests;
drop policy if exists "admins manage reset requests" on public.password_reset_requests;
drop policy if exists "customers create own complaints" on public.complaints;
drop policy if exists "customers read own complaints" on public.complaints;
drop policy if exists "admins manage complaints" on public.complaints;
drop policy if exists "admins read audit logs" on public.audit_logs;
drop policy if exists "service insert audit logs" on public.audit_logs;

-- ============================================================
-- RLS POLICIES: profiles
-- ============================================================
create policy "users read own profile" on public.profiles
  for select using (id = auth.uid());

create policy "admins manage all profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- RLS POLICIES: organizations
-- ============================================================
create policy "admins manage organizations" on public.organizations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read organizations" on public.organizations
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- RLS POLICIES: customers
-- ============================================================
create policy "admins manage all customers" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own profile" on public.customers
  for select using (id = auth.uid());

create policy "customers update own profile" on public.customers
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- RLS POLICIES: vehicles
-- ============================================================
create policy "admins manage all vehicles" on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own vehicles" on public.vehicles
  for select using (customer_id = auth.uid());

-- ============================================================
-- RLS POLICIES: invitations
-- ============================================================
create policy "admins manage invitations" on public.invitations
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own invitations" on public.invitations
  for select using (owner_id = auth.uid());

create policy "customers create own invitations" on public.invitations
  for insert with check (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES: permissions
-- ============================================================
create policy "admins manage permissions" on public.permissions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "service insert permissions" on public.permissions
  for insert with check (true);

-- ============================================================
-- RLS POLICIES: detections
-- ============================================================
create policy "admins read all detections" on public.detections
  for select using (public.is_admin());

create policy "customers read own detections" on public.detections
  for select using (
    exists (
      select 1 from public.vehicles
      where vehicles.id = detections.vehicle_id
      and vehicles.customer_id = auth.uid()
    )
  );

create policy "service insert detections" on public.detections
  for insert with check (true);

-- ============================================================
-- RLS POLICIES: visits
-- ============================================================
create policy "admins manage all visits" on public.visits
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own visits" on public.visits
  for select using (
    exists (
      select 1 from public.vehicles
      where vehicles.id = visits.vehicle_id
      and vehicles.customer_id = auth.uid()
    )
  );

create policy "service insert visits" on public.visits
  for insert with check (true);

create policy "service update visits" on public.visits
  for update using (true) with check (true);

-- ============================================================
-- RLS POLICIES: vehicle_sessions
-- ============================================================
create policy "admins manage all sessions" on public.vehicle_sessions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own vehicle sessions" on public.vehicle_sessions
  for select using (
    exists (
      select 1 from public.vehicles
      where vehicles.id = vehicle_sessions.vehicle_id
      and vehicles.customer_id = auth.uid()
    )
  );

create policy "service insert sessions" on public.vehicle_sessions
  for insert with check (true);

create policy "service update sessions" on public.vehicle_sessions
  for update using (true) with check (true);

-- ============================================================
-- RLS POLICIES: evidence
-- ============================================================
create policy "admins manage all evidence" on public.evidence
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own vehicle evidence" on public.evidence
  for select using (
    exists (
      select 1 from public.detections
      join public.vehicles on vehicles.id = detections.vehicle_id
      where detections.id = evidence.detection_id
      and vehicles.customer_id = auth.uid()
    )
  );

create policy "service insert evidence" on public.evidence
  for insert with check (true);

-- ============================================================
-- RLS POLICIES: alerts
-- ============================================================
create policy "admins manage alerts" on public.alerts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "customers read own alerts" on public.alerts
  for select using (
    exists (
      select 1 from public.detections
      join public.vehicles on vehicles.id = detections.vehicle_id
      where detections.id = alerts.detection_id
      and vehicles.customer_id = auth.uid()
    )
  );

create policy "service insert alerts" on public.alerts
  for insert with check (true);

-- ============================================================
-- RLS POLICIES: password_reset_requests
-- ============================================================
create policy "customers create own reset requests" on public.password_reset_requests
  for insert with check (customer_id = auth.uid());

create policy "customers read own reset requests" on public.password_reset_requests
  for select using (customer_id = auth.uid());

create policy "admins manage reset requests" on public.password_reset_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- RLS POLICIES: complaints
-- ============================================================
create policy "customers create own complaints" on public.complaints
  for insert with check (customer_id = auth.uid());

create policy "customers read own complaints" on public.complaints
  for select using (customer_id = auth.uid());

create policy "admins manage complaints" on public.complaints
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- RLS POLICIES: audit_logs
-- ============================================================
create policy "admins read audit logs" on public.audit_logs
  for select using (public.is_admin());

create policy "service insert audit logs" on public.audit_logs
  for insert with check (true);

-- ============================================================
-- 31-DAY RETENTION CLEANUP FUNCTION
-- ============================================================
create or replace function public.cleanup_old_records()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.detections where detected_at < now() - interval '31 days';
  delete from public.visits where entry_time < now() - interval '31 days';
  delete from public.alerts where is_read = true and acknowledged_at < now() - interval '31 days';
  delete from public.audit_logs where created_at < now() - interval '31 days';
  delete from public.evidence where created_at < now() - interval '31 days';
end;
$$;

-- ============================================================
-- REALTIME PUBLICATION
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'detections') then
    alter publication supabase_realtime add table public.detections;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts') then
    alter publication supabase_realtime add table public.alerts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'password_reset_requests') then
    alter publication supabase_realtime add table public.password_reset_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'complaints') then
    alter publication supabase_realtime add table public.complaints;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicle_sessions') then
    alter publication supabase_realtime add table public.vehicle_sessions;
  end if;
end
$$;
