-- ============================================================
-- NEXPLATE AI - Incremental schema enhancements (Prompt 2/3)
-- Run this AFTER supabase/schema.sql in the Supabase SQL Editor.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- 1. INVITATIONS - add richer visitor/invitation fields
-- ------------------------------------------------------------
alter table public.invitations
  add column if not exists visitor_name text;
alter table public.invitations
  add column if not exists vehicle_type text;
alter table public.invitations
  add column if not exists purpose_description text;
alter table public.invitations
  add column if not exists invited_by_role text check (invited_by_role in ('ADMIN', 'CUSTOMER', 'SERVICE'));
alter table public.invitations
  add column if not exists destination text;
alter table public.invitations
  add column if not exists notes text;
alter table public.invitations
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'BLOCKED', 'CANCELLED', 'EXPIRED'));
alter table public.invitations
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 2. PERMISSIONS - time-window and reason support
-- ------------------------------------------------------------
alter table public.permissions
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete cascade;
alter table public.permissions
  add column if not exists valid_from timestamptz;
alter table public.permissions
  add column if not exists valid_until timestamptz;
alter table public.permissions
  add column if not exists allowed_entry_from time;
alter table public.permissions
  add column if not exists allowed_entry_until time;
alter table public.permissions
  add column if not exists reason text;
alter table public.permissions
  add column if not exists updated_at timestamptz not null default now();
alter table public.permissions
  alter column status set default 'ACTIVE';

-- ------------------------------------------------------------
-- 3. VEHICLES - separate registration state from permission state
-- ------------------------------------------------------------
alter table public.vehicles
  add column if not exists registration_status text not null default 'REGISTERED'
    check (registration_status in ('REGISTERED', 'UNREGISTERED', 'PENDING'));
alter table public.vehicles
  add column if not exists primary_driver_id uuid;
alter table public.vehicles
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 4. DETECTIONS - decision model alignment
-- ------------------------------------------------------------
alter table public.detections
  add column if not exists decision_status text;
alter table public.detections
  add column if not exists decision_reason text;
alter table public.detections
  add column if not exists session_id uuid references public.vehicle_sessions(id) on delete set null;
alter table public.detections
  add column if not exists plate_valid boolean default true;
alter table public.detections
  add column if not exists raw_ocr text;

-- ------------------------------------------------------------
-- 5. VEHICLE SESSIONS - best OCR / tracking metadata
-- ------------------------------------------------------------
alter table public.vehicle_sessions
  add column if not exists best_ocr text;
alter table public.vehicle_sessions
  add column if not exists best_ocr_confidence numeric;
alter table public.vehicle_sessions
  add column if not exists closed_reason text;
alter table public.vehicle_sessions
  add column if not exists entry_time timestamptz;
alter table public.vehicle_sessions
  add column if not exists exit_time timestamptz;
alter table public.vehicle_sessions
  add column if not exists duration_minutes integer;
alter table public.vehicle_sessions
  add column if not exists authorization_status text;

-- ------------------------------------------------------------
-- 6. VISITS - camera + invitation reference for analytics
-- ------------------------------------------------------------
alter table public.visits
  add column if not exists camera_id text;
alter table public.visits
  add column if not exists invitation_id uuid references public.invitations(id) on delete set null;
alter table public.visits
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 7. ALERTS - source separation
-- ------------------------------------------------------------
alter table public.alerts
  add column if not exists source text not null default 'REAL';
alter table public.alerts
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 8. COMPLAINTS - admin response support
-- ------------------------------------------------------------
alter table public.complaints
  add column if not exists admin_response text;
alter table public.complaints
  add column if not exists responded_by uuid references auth.users(id) on delete set null;
alter table public.complaints
  add column if not exists responded_at timestamptz;
alter table public.complaints
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 9. SAFETY: ensure normalized_plate exists before indexes
--    (handles tables created by an older schema.sql)
-- ------------------------------------------------------------
alter table public.vehicles         add column if not exists normalized_plate text not null default '';
alter table public.invitations      add column if not exists normalized_plate text not null default '';
alter table public.permissions      add column if not exists normalized_plate text not null default '';
alter table public.detections       add column if not exists normalized_plate text not null default '';
alter table public.visits           add column if not exists normalized_plate text not null default '';
alter table public.vehicle_sessions add column if not exists normalized_plate text not null default '';

-- Also ensure the invitations status column has the correct default
-- (older schemas may have used 'Guest' as a purpose value)
alter table public.invitations
  alter column status set default 'ACTIVE';

-- ------------------------------------------------------------
-- 10. IMPROVED INDEXES
-- ------------------------------------------------------------
create index if not exists idx_permissions_vehicle_window on public.permissions(vehicle_id, valid_from, valid_until);
create index if not exists idx_permissions_plate_window on public.permissions(normalized_plate, valid_from, valid_until, status);
create index if not exists idx_invitations_active_window on public.invitations(status, start_at, end_at);
create index if not exists idx_detections_session on public.detections(session_id);
create index if not exists idx_visits_camera on public.visits(camera_id);

-- ------------------------------------------------------------
-- 11. RETENTION - hardened cleanup with dependent-record safe ordering
-- ------------------------------------------------------------
create or replace function public.cleanup_old_records()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Evidence depends on detections -> delete evidence first
  delete from public.evidence
    where created_at < now() - interval '31 days'
       or exists (
           select 1 from public.detections d
           where d.id = evidence.detection_id
             and d.detected_at < now() - interval '31 days'
       );

  -- Detections feed visits/alerts -> remove children first
  delete from public.alerts
    where created_at < now() - interval '31 days'
       or exists (
           select 1 from public.detections d
           where d.id = alerts.detection_id
             and d.detected_at < now() - interval '31 days'
       );

  delete from public.vehicle_sessions
    where coalesce(session_end, last_seen_at) < now() - interval '31 days';

  delete from public.detections
    where detected_at < now() - interval '31 days';

  delete from public.visits
    where entry_time < now() - interval '31 days';

  -- Housekeeping: expire stale invitations
  update public.invitations
    set status = 'EXPIRED', updated_at = now()
    where status = 'ACTIVE'
      and end_at < now() - interval '1 hour';

  -- Housekeeping: auto-expire timed-out permissions
  update public.permissions
    set status = 'EXPIRED', updated_at = now()
    where status not in ('BLOCKED', 'CANCELLED', 'EXPIRED')
      and valid_until is not null
      and valid_until < now() - interval '1 hour';

  delete from public.audit_logs
    where created_at < now() - interval '31 days';
end;
$$;

-- ------------------------------------------------------------
-- 12. REALTIME - invitation & visit publications
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invitations') then
    alter publication supabase_realtime add table public.invitations;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visits') then
    alter publication supabase_realtime add table public.visits;
  end if;
end
$$;