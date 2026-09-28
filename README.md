# License Plate Recognition

Autonomous vehicle security and license plate recognition for Indian vehicle registrations. The project combines a Python computer-vision pipeline (YOLO and EasyOCR), a Node.js API, and a React/Vite operations dashboard.

This is a research and demonstration prototype, not a production access-control system. See [PROJECT_README.md](PROJECT_README.md) for architecture, features, limitations, and detailed project notes.

## Quick Start

Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

Install and run the backend and frontend in separate terminals:

```powershell
cd backend
npm install
npm start
```

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server prints the dashboard URL when it starts. Backend configuration examples are in `backend/.env.example`; copy that file to `backend/.env` and set the required values locally. Never commit `.env` files or credentials. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for database setup.

## Repository Contents

- `src/` - Python detection, OCR, validation, camera, and runtime modules.
- `backend/` - Node.js API and Supabase integration.
- `frontend/` - React/Vite dashboard.
- `data/` - vehicle and license-plate datasets and related SQL/CSV files.
- `supabase/` - database schema and migrations.

Dataset images may contain visible vehicle registration plates.