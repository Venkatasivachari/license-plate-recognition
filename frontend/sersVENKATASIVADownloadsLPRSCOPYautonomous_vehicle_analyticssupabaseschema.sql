create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null default 'OTHER' check (organization_type in ('COMMUNITY', 'COLLEGE', 'UNIVERSITY', 'CORPORATE', 'FACTORY', 'HOSPITAL', 'HOTEL', 'INSTITUTION', 'OTHER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  location text,
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'CUSTOMER')) default 'CUSTOMER',
  customer_id text,
  full_name text,
  email text,
  phone text,
  location_unit text,
  organization_id uuid references public.organizations(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete set null,
  plate_number text not null,
  normalized_plate text,
  vehicle_type text not null default 'Car',
  make text,
  model text,
  color text,
  driver_id uuid,
  purpose text,
  registration_status text not null default 'PENDING' check (registration_status in ('PENDING', 'REGISTERED', 'REJECTED')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  notes text,
  source text not null default 'REAL' check (source in ('REAL', 'DEMO')),
  organization_id uuid references public.organizations(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  license_number text,
  relationship text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  plate_number text not null,
  permission_type text not null default 'PERMANENT' check (permission_type in ('PERMANENT', 'TEMPORARY')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'EXPIRED', 'CANCELLED')),
  valid_from timestamptz,
  valid_until timestamptz,
  allowed_entry_from time,
  allowed_entry_until time,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_role text not null default 'ADMIN' check (created_by_role in ('ADMIN', 'CUSTOMER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  invited_vehicle_number text not null,
  normalized_plate text,
  visitor_name text,
  vehicle_type text,
  purpose_type text not null default 'Guest Visit',
  purpose_description text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  destination text,
  destination_unit text,
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_by_role text not null default 'ADMIN' check (invited_by_role in ('ADMIN', 'CUSTOMER')),
  customer_id uuid references auth.users(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'CANCELLED', 'EXPIRED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists public.vehicle_sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  normalized_plate text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ENDED', 'CLOSED')),
  entry_time timestamptz,
  exit_time timestamptz,
  duration_seconds integer,
  camera_id text,
  site_id uuid references public.sites(id) on delete set null,
  source text not null default 'REAL' check (source in ('REAL', 'DEMO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.detections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  session_id uuid references public.vehicle_sessions(id) on delete set null,
  raw_ocr text,
  normalized_plate text,
  ocr_confidence numeric,
  yolo_confidence numeric,
  vehicle_type text,
  plate_valid boolean default false,
  ocr_state text not null default 'OCR_UNCERTAIN' check (ocr_state in ('OCR_FAILED', 'OCR_UNCERTAIN', 'CONFIRMED')),
  status text not null default 'OCR_UNCERTAIN' check (status in ('OCR_FAILED', 'OCR_UNCERTAIN', 'VERIFY_REQUIRED', 'REGISTERED', 'UNREGISTERED', 'PERMISSION_VALID', 'PERMISSION_EXPIRED', 'PERMISSION_BLOCKED', 'INVITATION_ACTIVE', 'INVITATION_EXPIRED', 'INVITATION_BLOCKED', 'AUTHORIZED', 'UNAUTHORIZED')),
  decision text,
  purpose text,
  invitation_id uuid references public.invitations(id) on delete set null,
  camera_id text not null default 'laptop-browser-1',
  site_id uuid references public.sites(id) on delete set null,
  evidence_path text,
  evidence_url text,
  source text not null default 'REAL' check (source in ('REAL', 'DEMO')),
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles(id) on delete set null,
  session_id uuid references public.vehicle_sessions(id) on delete set null,
  entry_time timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  exit_time timestamptz,
  duration_seconds integer,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED', 'DENIED')),
  authorization_status text not null default 'UNAUTHORIZED',
  purpose text,
  invitation_id uuid references public.invitations(id) on delete set null,
  site_id uuid references public.sites(id) on delete set null,
  source text not null default 'REAL' check (source in ('REAL', 'DEMO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  detection_id uuid references public.detections(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  storage_path text not null,
  captured_at timestamptz not null default now(),
  camera_id text,
  site_id uuid references public.sites(id) on delete set null,
  evidence_type text not null default 'vehicle-image' check (evidence_type in ('vehicle-image', 'plate-crop', 'authorization-snapshot', 'unauthorized-snapshot')),
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  detection_id uuid references public.detections(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  alert_type text not null,
  severity text not null default 'MEDIUM' check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  plate_number text,
  category text not null check (category in ('GATE_ISSUE', 'WRONG_DETECTION', 'OTHER')),
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  plate_number text not null,
  owner_name text not null,
  new_password text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists customer_id text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists location_unit text;
alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.profiles add column if not exists site_id uuid references public.sites(id) on delete set null;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists updated_at timestamptz;

alter table public.vehicles add column if not exists normalized_plate text;
alter table public.vehicles add column if not exists driver_id uuid;
alter table public.vehicles add column if not exists registration_status text;
alter table public.vehicles add column if not exists notes text;
alter table public.vehicles add column if not exists source text;
alter table public.vehicles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.vehicles add column if not exists site_id uuid references public.sites(id) on delete set null;
alter table public.vehicles add column if not exists updated_at timestamptz;

alter table public.permissions add column if not exists vehicle_id uuid references public.vehicles(id) on delete cascade;
alter table public.permissions add column if not exists permission_type text;
alter table public.permissions add column if not exists valid_from timestamptz;
alter table public.permissions add column if not exists valid_until timestamptz;
alter table public.permissions add column if not exists allowed_entry_from time;
alter table public.permissions add column if not exists allowed_entry_until time;
alter table public.permissions add column if not exists reason text;
alter table public.permissions add column if not exists created_by_role text;
alter table public.permissions add column if not exists updated_at timestamptz;

alter table public.invitations add column if not exists invited_vehicle_number text;
alter table public.invitations add column if not exists normalized_plate text;
alter table public.invitations add column if not exists visitor_name text;
alter table public.invitations add column if not exists vehicle_type text;
alter table public.invitations add column if not exists purpose_type text;
alter table public.invitations add column if not exists purpose_description text;
alter table public.invitations add column if not exists destination text;
alter table public.invitations add column if not exists destination_unit text;
alter table public.invitations add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null;
alter table public.invitations add column if not exists invited_by_role text;
alter table public.invitations add column if not exists customer_id uuid references auth.users(id) on delete set null;
alter table public.invitations add column if not exists notes text;
alter table public.invitations add column if not exists updated_at timestamptz;

alter table public.vehicle_sessions add column if not exists normalized_plate text;
alter table public.vehicle_sessions add column if not exists camera_id text;
alter table public.vehicle_sessions add column if not exists site_id uuid references public.sites(id) on delete set null;
alter table public.vehicle_sessions add column if not exists source text;
alter table public.vehicle_sessions add column if not exists updated_at timestamptz;

alter table public.detections add column if not exists session_id uuid references public.vehicle_sessions(id) on delete set null;
alter table public.detections add column if not exists normalized_plate text;
alter table public.detections add column if not exists plate_valid boolean;
alter table public.detections add column if not exists ocr_state text;
alter table public.detections add column if not exists site_id uuid references public.sites(id) on delete set null;
alter table public.detections add column if not exists updated_at timestamptz;

alter table public.visits add column if not exists session_id uuid references public.vehicle_sessions(id) on delete set null;
alter table public.visits add column if not exists invitation_id uuid references public.invitations(id) on delete set null;
alter table public.visits add column if not exists site_id uuid references public.sites(id) on delete set null;
alter table public.visits add column if not exists updated_at timestamptz;

alter table public.alerts add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;
alter table public.alerts add column if not exists alert_type text;
alter table public.alerts add column if not exists title text;
alter table public.alerts add column if not exists updated_at timestamptz;

alter table public.complaints add column if not exists admin_response text;
alter table public.complaints add column if not exists updated_at timestamptz;

alter table public.password_reset_requests add column if not exists updated_at timestamptz;

create or replace function public.normalize_plate(value text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(value, ''), '[^A-Za-z0-9]+', '', 'g'));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'CUSTOMER');

  insert into public.profiles (
    id,
    role,
    customer_id,
    full_name,
    email,
    phone,
    location_unit,
    status,
    created_at,
    updated_at
  )
  values (
    new.id,
    case when requested_role in ('ADMIN', 'CUSTOMER') then requested_role else 'CUSTOMER' end,
    new.raw_user_meta_data->>'customer_id',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'location_unit',
    'ACTIVE',
    now(),
    now()
  )
  on conflict (id) do update
    set role = excluded.role,
        customer_id = coalesce(public.profiles.customer_id, excluded.customer_id),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        email = excluded.email,
        phone = coalesce(public.profiles.phone, excluded.phone),
        location_unit = coalesce(public.profiles.location_unit, excluded.location_unit),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.cleanup_old_records()
returns void
language plpgsql
as $$
begin
  delete from public.evidence where captured_at < now() - interval '31 days';
  delete from public.alerts where created_at < now() - interval '31 days';
  delete from public.visits where entry_time < now() - interval '31 days';
  delete from public.vehicle_sessions where started_at < now() - interval '31 days';
  delete from public.detections where detected_at < now() - interval '31 days';
  delete from public.complaints where created_at < now() - interval '31 days';
end;
$$;

create unique index if not exists profiles_customer_id_unique_idx on public.profiles (customer_id) where customer_id is not null;
create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_organization_idx on public.profiles (organization_id);
create index if not exists sites_organization_idx on public.sites (organization_id);
create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);
create index if not exists vehicles_normalized_plate_idx on public.vehicles (normalized_plate);
create index if not exists vehicles_registration_status_idx on public.vehicles (registration_status);
create index if not exists vehicles_site_idx on public.vehicles (site_id);
create index if not exists drivers_customer_id_idx on public.drivers (customer_id);
create index if not exists permissions_vehicle_idx on public.permissions (vehicle_id);
create index if not exists permissions_plate_idx on public.permissions (plate_number, status);
create index if not exists invitations_owner_idx on public.invitations (owner_id);
create index if not exists invitations_customer_idx on public.invitations (customer_id);
create index if not exists invitations_normalized_plate_idx on public.invitations (normalized_plate);
create index if not exists invitations_window_idx on public.invitations (normalized_plate, start_at, end_at, status);
create index if not exists vehicle_sessions_plate_idx on public.vehicle_sessions (normalized_plate, started_at desc);
create index if not exists detections_vehicle_idx on public.detections (vehicle_id);
create index if not exists detections_normalized_plate_idx on public.detections (normalized_plate);
create index if not exists detections_detected_at_idx on public.detections (detected_at desc);
create index if not exists visits_vehicle_idx on public.visits (vehicle_id);
create index if not exists visits_entry_time_idx on public.visits (entry_time desc);
create index if not exists evidence_detection_idx on public.evidence (detection_id, captured_at desc);
create index if not exists alerts_created_at_idx on public.alerts (created_at desc);
create index if not exists complaints_customer_idx on public.complaints (customer_id, created_at desc);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists password_reset_requests_customer_idx on public.password_reset_requests (customer_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.permissions enable row level security;
alter table public.invitations enable row level security;
alter table public.vehicle_sessions enable row level security;
alter table public.detections enable row level security;
alter table public.visits enable row level security;
alter table public.evidence enable row level security;
alter table public.alerts enable row level security;
alter table public.complaints enable row level security;
alter table public.audit_logs enable row level security;
alter table public.password_reset_requests enable row level security;

drop policy if exists "admins manage organizations" on public.organizations;
drop policy if exists "authenticated users read organizations" on public.organizations;
drop policy if exists "admins manage sites" on public.sites;
drop policy if exists "authenticated users read sites" on public.sites;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "admins manage vehicles" on public.vehicles;
drop policy if exists "customers read own vehicles" on public.vehicles;
drop policy if exists "admins manage drivers" on public.drivers;
drop policy if exists "customers read own drivers" on public.drivers;
drop policy if exists "customers insert own drivers" on public.drivers;
drop policy if exists "admins manage permissions" on public.permissions;
drop policy if exists "customers read own permissions" on public.permissions;
drop policy if exists "customers insert own permissions" on public.permissions;
drop policy if exists "admins manage invitations" on public.invitations;
drop policy if exists "customers read own invitations" on public.invitations;
drop policy if exists "customers create own invitations" on public.invitations;
drop policy if exists "admins manage vehicle sessions" on public.vehicle_sessions;
drop policy if exists "customers read own sessions" on public.vehicle_sessions;
drop policy if exists "admins manage detections" on public.detections;
drop policy if exists "customers read own detections" on public.detections;
drop policy if exists "admins manage visits" on public.visits;
drop policy if exists "customers read own visits" on public.visits;
drop policy if exists "admins manage evidence" on public.evidence;
drop policy if exists "customers read own evidence" on public.evidence;
drop policy if exists "admins manage alerts" on public.alerts;
drop policy if exists "customers read own alerts" on public.alerts;
drop policy if exists "customers create own complaints" on public.complaints;
drop policy if exists "customers read own complaints" on public.complaints;
drop policy if exists "admins manage complaints" on public.complaints;
drop policy if exists "admins read audit logs" on public.audit_logs;
drop policy if exists "customers create own reset requests" on public.password_reset_requests;
drop policy if exists "customers read own reset requests" on public.password_reset_requests;
drop policy if exists "admins manage reset requests" on public.password_reset_requests;

create policy "admins manage organizations" on public.organizations for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read organizations" on public.organizations for select using (auth.uid() is not null);

create policy "admins manage sites" on public.sites for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read sites" on public.sites for select using (auth.uid() is not null);

create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "users update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "admins manage vehicles" on public.vehicles for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own vehicles" on public.vehicles for select using (customer_id = auth.uid());

create policy "admins manage drivers" on public.drivers for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own drivers" on public.drivers for select using (customer_id = auth.uid());
create policy "customers insert own drivers" on public.drivers for insert with check (customer_id = auth.uid());

create policy "admins manage permissions" on public.permissions for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own permissions" on public.permissions for select using (
  exists (
    select 1 from public.vehicles v
    where v.id = permissions.vehicle_id
      and v.customer_id = auth.uid()
  )
);
create policy "customers insert own permissions" on public.permissions for insert with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.vehicles v
    where v.id = permissions.vehicle_id
      and v.customer_id = auth.uid()
  )
);

create policy "admins manage invitations" on public.invitations for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own invitations" on public.invitations for select using (owner_id = auth.uid() or customer_id = auth.uid());
create policy "customers create own invitations" on public.invitations for insert with check (owner_id = auth.uid() or customer_id = auth.uid());

create policy "admins manage vehicle sessions" on public.vehicle_sessions for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own sessions" on public.vehicle_sessions for select using (
  exists (
    select 1 from public.vehicles v
    where v.id = vehicle_sessions.vehicle_id
      and v.customer_id = auth.uid()
  )
);

create policy "admins manage detections" on public.detections for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own detections" on public.detections for select using (
  exists (
    select 1 from public.vehicles v
    where v.id = detections.vehicle_id
      and v.customer_id = auth.uid()
  )
);

create policy "admins manage visits" on public.visits for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own visits" on public.visits for select using (
  exists (
    select 1 from public.vehicles v
    where v.id = visits.vehicle_id
      and v.customer_id = auth.uid()
  )
);

create policy "admins manage evidence" on public.evidence for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own evidence" on public.evidence for select using (
  exists (
    select 1 from public.vehicles v
    where v.id = evidence.vehicle_id
      and v.customer_id = auth.uid()
  )
);

create policy "admins manage alerts" on public.alerts for all using (public.is_admin()) with check (public.is_admin());
create policy "customers read own alerts" on public.alerts for select using (
  exists (
    select 1
    from public.detections d
    join public.vehicles v on v.id = d.vehicle_id
    where d.id = alerts.detection_id
      and v.customer_id = auth.uid()
  )
);

create policy "customers create own complaints" on public.complaints for insert with check (customer_id = auth.uid());
create policy "customers read own complaints" on public.complaints for select using (customer_id = auth.uid());
create policy "admins manage complaints" on public.complaints for all using (public.is_admin()) with check (public.is_admin());

create policy "admins read audit logs" on public.audit_logs for select using (public.is_admin());
create policy "admins manage audit logs" on public.audit_logs for insert using (public.is_admin()) with check (public.is_admin());

create policy "customers create own reset requests" on public.password_reset_requests for insert with check (customer_id = auth.uid());
create policy "customers read own reset requests" on public.password_reset_requests for select using (customer_id = auth.uid());
create policy "admins manage reset requests" on public.password_reset_requests for all using (public.is_admin()) with check (public.is_admin());

create or replace trigger set_updated_at_organizations before update on public.organizations for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_sites before update on public.sites for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_vehicles before update on public.vehicles for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_drivers before update on public.drivers for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_permissions before update on public.permissions for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_invitations before update on public.invitations for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_vehicle_sessions before update on public.vehicle_sessions for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_detections before update on public.detections for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_visits before update on public.visits for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_alerts before update on public.alerts for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_complaints before update on public.complaints for each row execute function public.set_updated_at();
create or replace trigger set_updated_at_password_reset_requests before update on public.password_reset_requests for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'detections'
  ) then
    alter publication supabase_realtime add table public.detections;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alerts'
  ) then
    alter publication supabase_realtime add table public.alerts;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invitations'
  ) then
    alter publication supabase_realtime add table public.invitations;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vehicle_sessions'
  ) then
    alter publication supabase_realtime add table public.vehicle_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'password_reset_requests'
  ) then
    alter publication supabase_realtime add table public.password_reset_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'complaints'
  ) then
    alter publication supabase_realtime add table public.complaints;
  end if;
end
$$;
