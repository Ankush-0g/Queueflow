# QueueFlow — Queue Management System (QMS)

A full-stack queue management platform for banks, hospitals & service centers.

**Stack**: FastAPI (Python) · MongoDB · React 19 · Tailwind · Shadcn UI · WebSockets · Resend (email)

---
# Live demo
url : https://queueflowss.onrender.com

## Features

### Customer
- Register / login (JWT auth)
- Browse available queues across branches
- Join queue → instant digital token (e.g. `CS-001`)
- Live position + estimated wait time (real-time via WebSocket)
- QR code for token verification
- Cancel token, view history
- Email notifications: when you reach position #3 + when your turn arrives

### Admin
- Separate admin login (seeded from env)
- Dashboard analytics: total users, active queues, avg wait, completed today, 7-day chart
- Queue + counter CRUD
- Queue control: **Call Next** / Hold / Skip / Recall / Complete per counter
- User management: block / unblock
- Brute-force protection: 5 fails / 15 min lockout

### Public TV Display
- `/display/:queueId` — fullscreen lobby view
- Massive "Now Serving" cards per counter
- "Up Next" sidebar
- Auto-refreshes via WebSocket (no manual reload)

### Smart additions
- Rolling-average wait-time prediction (last 20 completed tokens)
- Statistical model — no AI cost
- Light / Dark mode

---

## Repository structure

```
queueflow/
├── backend/
│   ├── server.py            # All API endpoints + WebSocket + email + auth
│   ├── requirements.txt
│   └── .env.example         # Template — copy to .env
├── frontend/
│   ├── src/
│   │   ├── App.js           # Routes
│   │   ├── index.js
│   │   ├── index.css
│   │   ├── App.css
│   │   ├── lib/
│   │   │   └── api.js       # Axios instance with credentials + Bearer
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── ThemeContext.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── ui/          # Shadcn components
│   │   └── pages/
│   │       ├── Landing.jsx
│   │       ├── Login.jsx
│   │       ├── Register.jsx
│   │       ├── UserDashboard.jsx
│   │       ├── AdminDashboard.jsx
│   │       └── PublicDisplay.jsx
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── craco.config.js
│   ├── jsconfig.json
│   └── .env.example
└── README.md
```

---

## Local setup

### Prerequisites
- Python 3.11+
- Node.js 18+ and Yarn (`npm i -g yarn`)
- MongoDB running locally on `mongodb://localhost:27017` (or any URI)

### 1) Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then edit .env
uvicorn server:app --reload --port 8001
```

`backend/.env` — required keys:

```
MONGO_URL=mongodb://localhost:27017
DB_NAME=queueflow
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=replace-with-64-char-random-hex
ADMIN_EMAIL=admin@qms.com
ADMIN_PASSWORD=admin123
RESEND_API_KEY=                   # leave blank to log emails to console
SENDER_EMAIL=onboarding@resend.dev
```

Generate a JWT secret: `python -c "import secrets;print(secrets.token_hex(32))"`

The admin user is auto-seeded on first startup.

### 2) Frontend

```bash
cd frontend
yarn install
cp .env.example .env              # then edit .env
yarn start                        # opens http://localhost:3000
```

`frontend/.env`:

```
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 3) First run

1. Open `http://localhost:3000`
2. Click **Admin Sign-In**, use `admin@qms.com` / `admin123`
3. Tab → **Queues & Counters** → Add a queue and at least one counter
4. Open another browser, register a new user, join the queue
5. Back in admin → **Queue Control** → click **CALL NEXT** on a counter
6. Open `/display/{queue-id}` in a third tab/TV (no auth)

---

## API overview

All routes are prefixed `/api`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Create user account |
| POST | `/api/auth/login` | — | Login (5/15 lockout) |
| POST | `/api/auth/logout` | user | Clear cookies |
| GET  | `/api/auth/me` | user | Current user |
| GET  | `/api/queues` | user | List active queues + live stats |
| POST | `/api/queues` | admin | Create queue |
| PUT  | `/api/queues/{id}` | admin | Update queue |
| DELETE | `/api/queues/{id}` | admin | Soft-delete queue |
| GET  | `/api/counters` | user | List counters |
| POST | `/api/counters` | admin | Create counter |
| DELETE | `/api/counters/{id}` | admin | Delete counter |
| POST | `/api/queues/{id}/join` | user | Issue token |
| GET  | `/api/tokens/my` | user | My tokens + position |
| POST | `/api/tokens/{id}/cancel` | user | Cancel own token |
| GET  | `/api/tokens?queue_id=` | admin | List tokens by queue |
| POST | `/api/queues/{id}/call-next` | admin | Call next on counter |
| POST | `/api/tokens/{id}/skip` | admin | Skip token |
| POST | `/api/tokens/{id}/hold` | admin | Hold token |
| POST | `/api/tokens/{id}/recall` | admin | Re-queue held/skipped |
| POST | `/api/tokens/{id}/complete` | admin | Complete |
| GET  | `/api/admin/users` | admin | All users |
| POST | `/api/admin/users/{id}/block` | admin | Block user |
| POST | `/api/admin/users/{id}/unblock` | admin | Unblock |
| GET  | `/api/admin/stats` | admin | Dashboard analytics |
| GET  | `/api/display/{id}` | — | Public display data |
| WS   | `/api/ws/queue/{id}` | — | Public queue events |
| WS   | `/api/ws/user?token=` | user JWT | Per-user events |
| WS   | `/api/ws/admin?token=` | admin JWT | All queue events |

WebSocket payload: `{ event, queue_id, data, ts }` —
events: `token_joined`, `token_called`, `token_skipped`, `token_hold`, `token_recalled`, `token_completed`, `token_cancelled`.

Interactive docs: `http://localhost:8001/docs`

---

## Deployment

### Backend (Render )
- Set the env vars above in your provider's dashboard
- Start command: `uvicorn server:app --host 0.0.0.0 --port $PORT`
- Use **MongoDB Atlas** for production `MONGO_URL`

### Frontend (Render/static project)
- Build command: `npm install &&  npm run build`
- Publish directory: `build/`
- Env var: `REACT_APP_BACKEND_URL=https://backend.example.com`

### Email (Resend)
1. Create account at https://resend.com
2. Generate API key
3. Verify your sender domain (or keep `onboarding@resend.dev` for testing)
4. Set `RESEND_API_KEY` in backend env
5. Restart backend

---

## Push to GitHub

```bash
cd queueflow
git init
git add .
git commit -m "Initial commit: QueueFlow QMS"
git branch -M main
git remote add origin https://github.com/<you>/queueflow.git
git push -u origin main
```

`.gitignore` is already included (excludes `node_modules`, `.venv`, `.env`).

---

## License
MIT — do whatever you want, no warranty.
