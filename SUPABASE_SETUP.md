# Supabase setup

The application uses Supabase PostgreSQL through the Node backend. Local demo login is opt-in for Vite development only; production builds never fall back to browser-stored credentials.

## 1. Create the project

1. Open https://supabase.com/dashboard.
2. Create a new project.
3. In **SQL Editor**, open `supabase/schema.sql` from this repository and run it.
4. **Run the enhanced schema migration**. Execute `supabase/migrations/20260911_enhance_invitations_permissions.sql` to add invitation/permission fields, session fields, retention, and realtime support.
5. **Run the production auth hardening migration**. Execute `supabase/migrations/20261104_production_auth_hardening.sql`. It prevents user metadata from assigning the `ADMIN` role, removes customer policies that could alter profiles or grant permissions, restricts service-write policies, and drops the unused plaintext-password column only if it is empty. If it stops because that column contains values, back up and securely remediate those records before rerunning; do not copy plaintext passwords elsewhere.
6. In **Project Settings > API**, copy:
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
DEMO_MODE=false                         # never enable in production
CORS_ORIGINS=https://your-frontend.example.com
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
VITE_DEMO_MODE=false
```

Then run:

```powershell
npm run dev -- --host 127.0.0.1
```

## Important

- **Realtime:** the migration publishes `invitations` and `visits` tables to the Supabase realtime channel (`public:invitations`, `public:visits`). The dashboard pushes live access events over the backend WebSocket (`/ws`), so no frontend Supabase client is required.
- **Retention (Policy B):** records older than **31 days** are deleted automatically by the `public.cleanup_old_records()` function. The backend calls it every 6 hours (`RETENTION_INTERVAL_MS`) and on boot. No unpurposed data is kept longer than the retention window.
- **Access decisions:** the backend `evaluateAccess` resolves `BLOCKED → UNAUTHORIZED`, permission time-windows, and invitation windows against the **current timestamp**. OCR failures are never classified as "unauthorized"; they surface as `OCR_FAILED` / `OCR_UNCERTAIN`.
- **Auth:** the SQL trigger always creates new users as `CUSTOMER`; caller-supplied Auth metadata must never grant `ADMIN`. Provision admin roles through a trusted operator-only database procedure or SQL Editor workflow, then verify the matching `profiles` row. Customer records are scoped by backend authorization and RLS.
- **Local demo:** to test the browser-only demo login, set `VITE_DEMO_MODE=true` in a development-only `frontend/.env` and `DEMO_MODE=true` in a local backend `.env`. Never use either setting in production.
- **Network boundary:** keep the Python AI service on a private interface/network. Set `LPRS_AI_HOST=127.0.0.1` for same-host deployments; do not expose port 5001 directly to the public internet.
- **Rate limiting:** the API applies per-process login and password-reset limits. Multi-instance deployments still need a shared rate limiter at the gateway/load balancer.
