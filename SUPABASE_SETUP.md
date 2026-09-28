# Supabase setup

The application now uses Supabase PostgreSQL for the Node backend. The browser keeps its local demo fallback only when Supabase is not configured.

## 1. Create the project

1. Open https://supabase.com/dashboard.
2. Create a new project.
3. In **SQL Editor**, open `supabase/schema.sql` from this repository and run it.
4. **Run the enhanced migration** (adds invitation/permission time-window columns, vehicle session fields, retention function, and realtime publications). Open `supabase/migrations/20260911_enhance_invitations_permissions.sql` in the SQL Editor and execute it. This is safe to run on top of an existing `schema.sql` deployment (all changes are additive and idempotent).
4. In **Project Settings > API**, copy:
   - Project URL
   - `service_role` key for the backend only
   - `anon` key for the frontend if direct browser Supabase access is later enabled

Never expose the `service_role` key in the frontend or commit it to git.

## 2. Configure the backend

Create `backend/.env` from `backend/.env.example`:

```text
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SERVICE_TOKEN=your-websocket-token       # required for AI service to push events
VISIT_CLOSE_AFTER_MS=120000              # 2 minutes, optional
RETENTION_INTERVAL_MS=21600000           # 6 hours, optional
```

### Python AI service

The Python pipeline (YOLO + EasyOCR) runs on port **5001** and forwards every frame result to `http://localhost:4000/api/events` automatically. It requires OpenCV, YOLO, and EasyOCR — see `src/requirements.txt`.

Start it from the `backend` folder:

```powershell
npm install
npm start
```

Check `http://localhost:4000/health`. It should report `"database":"SUPABASE"`.

## 3. Configure the frontend

Create `frontend/.env`:

```text
VITE_API_URL=http://localhost:4000
VITE_AI_URL=http://localhost:5001
```

Then run:

```powershell
npm run dev -- --host 127.0.0.1
```

## Important

- **Realtime:** the migration publishes `invitations` and `visits` tables to the Supabase realtime channel (`public:invitations`, `public:visits`). The dashboard pushes live access events over the backend WebSocket (`/ws`), so no frontend Supabase client is required.
- **Retention (Policy B):** records older than **31 days** are deleted automatically by the `public.cleanup_old_records()` function. The backend calls it every 6 hours (`RETENTION_INTERVAL_MS`) and on boot. No unpurposed data is kept longer than the retention window.
- **Access decisions:** the backend `evaluateAccess` resolves `BLOCKED → UNAUTHORIZED`, permission time-windows, and invitation windows against the **current timestamp**. OCR failures are never classified as "unauthorized"; they surface as `OCR_FAILED` / `OCR_UNCERTAIN`.
- **Auth:** for production, create users in Supabase Auth and attach `role` (ADMIN/CUSTOMER), `display_name`, and `plate_number` metadata. The SQL trigger creates a matching `profiles` row automatically. Customer accounts read only their own records (RLS).
