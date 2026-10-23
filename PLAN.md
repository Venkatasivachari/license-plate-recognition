# NEXPLATE AI - Implementation Status

## Current State
- **Frontend**: React app in `frontend/src/main.jsx` + `styles.css`, built with Vite. Real Supabase data via `frontend/src/services/localStorageService.js` (API-first, localStorage only as offline/demo fallback).
- **Backend**: Express API (`backend/src/server.js`) on port 4000, uses Supabase PostgreSQL (service role) as the system of record; in-memory store only when Supabase is not configured.
- **Database**: `supabase/schema.sql` (base, deployed) + `supabase/migrations/20260911_enhance_invitations_permissions.sql` (additive migration - run manually in the SQL Editor).
- **AI pipeline**: Python service (`src/`) on port 5001 - YOLO vehicle detection + trained plate detector + EasyOCR + multi-frame OCR consensus; posts results to `/api/events`.

## What Is Implemented
### Access control (backend `evaluateAccess`)
- Decision states: `OCR_FAILED`, `OCR_UNCERTAIN`, `INVALID_PLATE`, `REGISTERED`, `UNREGISTERED`, `PERMISSION_VALID`, `PERMISSION_EXPIRED`, `PERMISSION_BLOCKED`, `INVITATION_ACTIVE`, `INVITATION_EXPIRED`, `INVITATION_BLOCKED`, `AUTHORIZED`, `UNAUTHORIZED`, `VERIFY_REQUIRED`, `BLOCKED`.
- OCR failures are NEVER labeled `UNAUTHORIZED`.
- Time-window checks (`valid_from`/`valid_until`) compare against the current timestamp; BLOCKED overrides any valid window.

### Invitations & permissions
- Fixed purpose list plus "Other" (requires `purpose_description`).
- New columns: `visitor_name`, `purpose_description`, `invited_by_role`, `destination`, `notes`, user-created permission windows (`valid_from`, `valid_until`, `allowed_entry_from`, `allowed_entry_until`, `reason`).
- Role-scoped records, admin status transitions (`ACTIVE`/`BLOCKED`/`CANCELLED`/`EXPIRED`) with audit logs.


### Realtime + retention
- Backend WebSocket `/ws` pushes live access events; Supabase realtime published for `invitations` and `visits`.
- Retention = Policy B: `public.cleanup_old_records()` deletes everything older than 31 days (dependent-order). Backend invokes it on boot and every 6 hours.

### Frontend
- Camera component: real `getUserMedia`, device selector, Start/Stop/Restart, status pill, FPS + resolution, AI engine health probe, frames post to `/process-frame`.
- Vehicle Verification Center: live plate context (vehicle, invitations, visits, detections, permissions) from the API.
- Invitations/Permissions pages load from and write to the API with the new fields.
- Customer portal pulls its vehicles, invitations, and complaints from the API.
- Reports + Analytics show only real registry data; CSV + Print/PDF export.

## How to Deploy
1. Run `supabase/schema.sql` in the SQL Editor, then `supabase/migrations/20260911_enhance_invitations_permissions.sql`.
2. Configure `backend/.env` (see `SUPABASE_SETUP.md`) - service-role key stays backend-only.
3. Start backend (`cd backend && npm start`), Python AI (`python src/ai_service.py`), frontend (`cd frontend && npm run dev -- --host 127.0.0.1`).
4. Verify `http://localhost:4000/health` reports SUPABASE.

## Remaining / Notes
- Live Supabase DDL cannot be executed from this repo - run migrations in the Supabase SQL Editor.
- Rotate the service-role key if `backend/.env` was ever shared externally.
- Named ADMINS must be created in Supabase Auth with `role: "ADMIN"` metadata.
