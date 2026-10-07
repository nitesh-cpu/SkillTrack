# SkillTrack API

Single Express application, MongoDB/Mongoose persistence, JWT bearer authentication, role-based access control, and Jest/Supertest tests.

## Setup

1. Install Node.js 20.19+ (or 22.12+) and run `npm install`.
2. Start a local MongoDB server, or use a MongoDB connection string you control.
3. Copy `.env.example` to `.env`. Set `MONGODB_URI`, `JWT_SECRET` (a random string of at least 32 characters), `CLIENT_ORIGIN`, SMTP settings, and a bootstrap `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (at least 12 characters).
4. Run `npm run seed` to create the first admin, initial skill catalog, and default scoring rule. Seeding is disabled in production unless explicitly enabled.
5. Run `npm run dev`. Health check: `GET http://localhost:5000/api/v1/health`.
6. Run `npm test` for the unit and Supertest suite.

Admin creates student/mentor accounts and assigns mentors. Public registration creates students only. Passwords are bcrypt hashes. Auth responses retain the existing `{ user, token }` contract and include a short-lived HS256 JWT; backend routes verify its issuer, audience, expiry, account role, and account auth version. The frontend keeps the bearer token in tab-scoped session storage and clears it on expiry or authentication failure.

## Development-only demo data

Set `DEV_DEMO_ACCOUNTS=true` and `DEV_DEMO_PASSWORD` (at least 12 characters) to seed a mentor and two assigned students. The password is never hard-coded; the same configured demo password is applied only to newly created demo users.

## API outline

- `/api/v1/auth` — register, login, current session, password reset.
- `/api/v1/student` — dashboard, own profile/progress/recommendations/tasks.
- `/api/v1/achievements` — student-owned submissions; mentors verify/reject assigned students only.
- `/api/v1/mentor` — assigned students, review queue/history, task assignment.
- `/api/v1/admin` — users, mentor allocation, skills/relationships, scoring rules, recalculation, audit.
- `/api/v1/skills` — active skill catalog and prerequisite graph.
- `/api/v1/scores` — current student's score, per-skill breakdown, and historical snapshots.

The legacy `/api/*` paths remain available for existing clients; new clients should use `/api/v1/*`. Authenticated directory and review lists support validated `page`, `limit`, and search/filter query parameters. Errors use the standard response envelope and include a request ID for log correlation. Production logs contain request metadata and error classifications, not credentials, request bodies, or stack traces.

Scoring rules can be created as drafts, edited while inactive, and activated. Weight values are validated between 0 and 1; active rules are immutable.

All successful responses use `{ "success": true, "message": "...", "data": ... }`; errors use `{ "success": false, "message": "...", "requestId": "..." }`.

## Password reset delivery

The API stores only a SHA-256 hash of short-lived, single-use reset tokens and emails the raw token in a one-time reset link. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, and (when required by the server) both `SMTP_USER` and `SMTP_PASSWORD`. `PASSWORD_RESET_URL` must use one of the configured `CLIENT_ORIGIN` values. In production, reset email configuration is required; reset tokens are never written to application logs.

## Achievement scoring

Only mentor-verified submissions contribute. The service applies the configured type/reliability weight, difficulty factor, and per-skill relevance, clamps achievement inputs and score outputs, returns a per-achievement breakdown, and appends score-history snapshots rather than overwriting history. Mapping relevance and difficulty are validated to [0, 1].
