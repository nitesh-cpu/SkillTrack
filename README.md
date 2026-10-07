# SkillTrack

SkillTrack is a role-based skill development platform that helps learners make progress visible through evidence, review, and skill relationships. Students submit work and track their skills; mentors guide assigned students by reviewing evidence and assigning tasks; administrators manage users, the skill catalog, scoring rules, and platform audit activity.

## Problem statement

Learning activity alone does not clearly show what a person can do. SkillTrack connects a learner's submitted evidence to skills, applies configurable and explainable scoring, and gives students and mentors a shared view of progress and next steps. It is designed to support that workflow without treating unverified activity as proven competency.

## Features

- **Student workspace:** skill summaries and history, evidence submissions, achievements, assigned tasks, progress analytics, recommendations, and a prerequisite skill graph.
- **Mentor workspace:** assigned-student directory and profiles, submission review with feedback, task assignment, student progress views, draft question authoring, and exams for assigned students.
- **Admin workspace:** user and role management, mentor-student assignments, skills and prerequisites, configurable scoring rules, question approval, exams, and searchable audit logs.
- **Question bank:** one shared question catalog with multiple-choice, true/false, and short-objective questions; mentor drafts require administrator approval before use.
- **Evidence-based scoring:** configurable evidence type, source reliability, verification, relevance, difficulty, and recency weights, with an explanation breakdown and append-only score history.
- **Role-aware APIs:** server-side authentication and authorization for `ADMIN`, `MENTOR`, and `STUDENT`, with corresponding frontend route guards.
- **Operational support:** request IDs, safe centralized errors, structured request/error logs, health endpoint, Docker images, Compose for local app services, and GitHub Actions CI.

## Architecture

```text
React SPA (Vite)
  └─ React Router → shared API service → /api/v1 REST API
                                       └─ Express routes → validation/auth/RBAC
                                                          → controllers → services
                                                          → Mongoose → MongoDB
```

- **Frontend:** React 18, JavaScript/JSX, Vite, React Router, Recharts, React Flow (`@xyflow/react`), and Lucide.
- **Backend:** Node.js, Express, Mongoose, MongoDB, JWT, bcrypt, express-validator, Helmet, CORS, and Nodemailer.
- **API:** versioned REST endpoints under `/api/v1`; legacy `/api/*` aliases remain mounted for existing clients.
- **Deployment:** frontend and backend containers are provided. MongoDB is external and must be provisioned and operated separately.

The existing single-service REST/MongoDB design keeps authentication, authorization, validation, and business operations in the backend, while the frontend remains a client of the established API contract. Controllers handle HTTP concerns; services own domain workflows and persistence. This avoids duplicating scoring or access decisions in the browser and fits the current feature set without adding service-to-service infrastructure.

### Role model and access control

| Role | Main capabilities |
| --- | --- |
| `STUDENT` | Manage own evidence and view own skills, tasks, history, graph, and recommendations. |
| `MENTOR` | Work with assigned students, review their pending evidence, and manage tasks within those assignments. |
| `ADMIN` | Manage users and assignments, skills and prerequisites, scoring configuration, question approval, exams, and audit records. |

The backend authenticates bearer JWTs, loads the active user, and checks the current database role and `authVersion`; changing a role, disabling an account, or resetting its password invalidates previously issued tokens. Route-level RBAC is supplemented by service-level ownership/assignment checks for student and task resources. Frontend route guards improve navigation but are not the security boundary.

### Evidence scoring and score history

Each evidence-to-skill mapping contributes a weighted score. The active `ScoringRule` supplies configurable weights and thresholds. The calculation combines evidence type, evidence source reliability, verification status, mapping relevance, difficulty, and recency decay. The weighted average is bounded to the score range, and malformed or out-of-range evidence is excluded. Pending evidence receives its configured verification weight (zero by default), while rejected evidence is excluded; mentor review can therefore change pending evidence's impact without a separate frontend score calculation.

Every calculation is stored as a `SkillScore` record rather than replacing prior calculations. Records include the score, prior score, whether it changed, calculation time, rule version, reason, evidence count, and a per-evidence breakdown. This lets clients present history and explain score changes. Recalculation is deterministic for the supplied evidence, rule, and calculation time; recency naturally means later calculations can differ as evidence ages.

### Prerequisites, graph, and recommendations

`SkillPrerequisite` records connect a prerequisite skill to a dependent skill. The service rejects self-links, duplicate links, and cycles when relationships are created. The graph API returns active skills as React Flow-compatible nodes plus prerequisite edges, score/status metadata, and stable layout positions; edge direction is prerequisite → dependent skill. Recommendation results are derived from current scores, configured thresholds, prerequisite relationships, and pending reviews—not random or fabricated learner statistics.

### Audit and security decisions

- Passwords are stored as bcrypt hashes. Password reset tokens are random, stored as hashes, single-use, and expire; reset invalidates the user's prior JWTs.
- JWT secrets and database/mail configuration are backend environment settings. Never put backend secrets in Vite variables, committed env files, or Docker build arguments.
- Helmet supplies security headers, CORS is restricted to configured client origins, request bodies are size-limited, and authentication/reset endpoints have rate limits.
- Validation rejects unknown fields on protected request surfaces; centralized error responses avoid returning stack traces and database details.
- Audit events record actor, action, entity, timestamp, and bounded metadata. Sensitive metadata keys are removed. Request/error logs use request IDs and omit query strings, authorization headers, and request bodies.
- The browser holds its bearer token in tab-scoped `sessionStorage`; logout clears that tab's session. This is not an `HttpOnly` cookie design, so deployments should also apply a restrictive Content Security Policy and keep frontend dependencies controlled.

## API overview

All current endpoints are under `/api/v1` (the legacy `/api` aliases remain for compatibility).

| Area | Route family | Typical use |
| --- | --- | --- |
| Health | `GET /api/v1/health` | Confirm the API process is responding. |
| Authentication | `/api/v1/auth` | Register, sign in, retrieve current user, request/reset password. |
| Student | `/api/v1/student` | Read dashboard, skills, tasks, assigned exams, exam attempts, autosaved answers, and recommendations. |
| Mentor | `/api/v1/mentor` | Assigned students, submission reviews, task assignment/details/updates/cancellation, and feedback. |
| Admin | `/api/v1/admin` | User/assignment/skill/rule/audit management. |
| Question bank | `/api/v1/questions` | Admin and mentor question authoring, filtering, approval, and archiving; students have no access. |
| Exams | `/api/v1/exams` | Create exams from approved question snapshots and assign them to students; mentors are scoped to their own exams and assigned learners. |
| Video learning | `/api/v1/learning` | Create and assign skill-aligned courses; students can resume assigned lessons and save video progress. |
| Submissions | `/api/v1/achievements` | Create and review student submissions and feedback. |
| Skills | `/api/v1/skills` | Skill catalog, prerequisite relationships, and graph data. |
| Scores | `/api/v1/scores` | Score details and history. |

Protected endpoints require `Authorization: Bearer <token>`. List endpoints that support large datasets accept pagination and filters as documented by their request validators. Error responses use a safe message and a request ID for support correlation.

Exam attempts are created only for the authenticated student's assignment and only during the scheduled window. Their question snapshots and server-calculated expiry are persisted; question and multiple-choice option order is randomized once per attempt, answers autosave through the API, and a backend expiry worker submits timed-out attempts. Students can request fullscreen; tab/window hiding and fullscreen exits are recorded and reviewable by admins/mentors without automatically failing the attempt. Student attempt responses omit answer keys and explanations.

Submitted attempts are evaluated server-side using normalized exact matching for multiple-choice, true/false, and short-objective answers. Results include the score, pass/fail outcome, answer counts, and topic/skill/difficulty breakdowns. Students can view their own results at `/api/v1/student/results`; admins and mentors use `/api/v1/exams/results`, with mentor results restricted to their currently assigned students.

Each evaluated exam creates idempotent, platform-verified assessment evidence per skill using that skill's own score and maximum marks. The existing scoring service recalculates skill scores from this evidence with the configured assessment, verification, difficulty, and recency weights; exam percentages are not copied directly into skill scores.

Learning courses use directly playable, public HTTPS MP4, WebM, or OGG URLs; the project does not add video uploads, a CDN, or private-media proxying. Admins can assign courses to active students, while mentors can assign their courses only to students currently assigned to them. Student lesson progress is stored per lesson and resumes from the last saved position; progress is sent periodically during playback and on pause.

The health route intentionally reports API availability only. The server connects to MongoDB before it opens its listener, so a normal started instance has passed initial connection setup; the endpoint does not expose database credentials or detailed infrastructure status.

## Requirements and local setup

- Node.js 22.12 or later and npm.
- A MongoDB instance reachable by the backend.
- Docker Engine and Docker Compose for containerized local runs.

1. Install backend and frontend dependencies:

   ```powershell
   cd backend
   npm ci
   cd ..\frontend
   npm ci
   ```

2. Configure the backend environment:

   ```powershell
   cd ..\backend
   Copy-Item .env.example .env
   ```

   Set `MONGODB_URI` and replace `JWT_SECRET` with a random secret of at least 32 characters. Configure SMTP settings to enable password reset email. Keep `.env` local and never commit it.

3. Start the backend and frontend in separate terminals:

   ```powershell
   cd backend
   npm run dev
   ```

   ```powershell
   cd frontend
   npm run dev
   ```

   The frontend defaults to `http://localhost:5000/api/v1`. Set `VITE_API_BASE_URL` in `frontend/.env.local` only if the API has a different public URL. This is public build-time configuration, not a place for secrets.

4. Verify the API at `http://localhost:5000/api/v1/health`.

Backend startup validates required configuration and connects to MongoDB before opening the HTTP listener. Production mode also requires HTTPS client/reset URLs and SMTP reset-mail configuration. See [backend/.env.example](./backend/.env.example) and [backend/.env.production.example](./backend/.env.production.example) for variable names and safe placeholders.

## Seed and demo flow

Run `npm run seed` from `backend` to initialize the first administrator, starter skill catalog, and scoring rule using configured environment variables. Seed behavior and optional development demo accounts are controlled by `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `DEV_DEMO_ACCOUNTS`, and `DEV_DEMO_PASSWORD`. No demo credentials are committed; use unique local credentials and keep them out of source control.

Suggested walkthrough:

1. Sign in as the seeded administrator; create or verify mentor/student users and assign a mentor to a student.
2. Sign in as the student, submit evidence mapped to skills, and explore the skill details, score history, progress, recommendations, and prerequisite graph.
3. Sign in as the assigned mentor, review the pending evidence with feedback, and assign a task.
4. Return to the student workspace to see review status, score impact, and assigned work.
5. Return to the administrator workspace to inspect the scoring rule and audit events generated by the workflow.

The seed script can optionally create local development accounts when explicitly enabled. Do not use demo accounts or shared seed credentials in a deployed environment.

## Testing and CI

```powershell
cd backend
npm test

cd ..\frontend
npm run build
```

Backend tests use Jest and Supertest. The frontend currently has no dedicated test runner; its production build is the frontend CI check. GitHub Actions runs backend tests, the frontend build, and container builds for pushes and pull requests targeting `main`. CI does not publish images or deploy them.

## Docker

### Local Compose

The local Compose setup runs the backend and frontend and expects MongoDB to be external:

1. Configure `backend/.env` as described above. For MongoDB running on the host, use a container-reachable URI such as `mongodb://host.docker.internal:27017/skilltrack`.
2. Run from the project root:

   ```powershell
   docker compose up --build
   ```

3. Open the frontend at `http://localhost:4173` and the API health endpoint at `http://localhost:5000/api/v1/health`.

Compose overrides backend `NODE_ENV` to `development` for local use and sets the allowed browser origin and reset URL for port 4173. The API still validates `MONGODB_URI` and `JWT_SECRET`.

### Production images

Build the backend image:

```powershell
docker build -f backend/Dockerfile -t skilltrack-backend:latest backend
```

Build the frontend image with the publicly reachable API URL:

```powershell
docker build -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=https://api.example.com/api/v1 -t skilltrack-frontend:latest frontend
```

Run the backend with production environment variables injected by the deployment platform. Deploy the frontend image on port 8080 and the backend on port 5000 (or configure the platform's ingress accordingly). Configure the backend `CLIENT_ORIGIN` to the deployed frontend origin, use HTTPS, supply a production MongoDB URI, a strong `JWT_SECRET`, and working SMTP credentials, then verify `/api/v1/health`.

The frontend API URL is embedded in static client assets at build time and is not secret. Never place backend secrets in Docker build arguments or Vite environment variables.

## Deployment and operational considerations

- Use a managed/external MongoDB service; configure network access and backups separately.
- Inject secrets through the hosting provider's secret manager, not a committed env file.
- Terminate TLS at the ingress/load balancer and set `CLIENT_ORIGIN` and `PASSWORD_RESET_URL` to the deployed HTTPS origin.
- The backend disables automatic Mongoose index creation in production; provision/verify required indexes as part of deployment operations.
- The backend container runs as the non-root Node user; the static frontend uses an unprivileged Nginx image.
- The included rate limiter is in-memory and therefore limits each backend process independently. A horizontally scaled deployment should use a shared rate-limit store or gateway policy.
- JWTs are stateless; password reset, account deactivation, and role changes invalidate them through `authVersion`, while ordinary logout clears the browser's tab-scoped token. Choose a short deployment-appropriate token lifetime and protect the client against script injection.
- CI validates tests/builds and container builds; release publishing, managed database provisioning, migrations/index operations, and deployment remain platform-specific.

## Interview readiness: design choices and trade-offs

- **Why this architecture:** the React SPA is a thin role-aware client; Express routes and middleware provide a single policy boundary; services keep domain rules out of HTTP handlers; MongoDB/Mongoose supports the existing document-oriented models and relationships. This preserves the existing application instead of adding distributed-system complexity.
- **How scoring works:** each valid evidence item receives a weight from the active rule's evidence-type, source, verification, relevance, difficulty, and recency factors. Skill score is the weighted average of included evidence, and each contribution is returned as an explanation. Rule version and calculation reason are recorded with every score snapshot.
- **How RBAC works:** JWT claims establish identity, then the backend compares the token role/version against the current active user record. Role middleware gates capability groups, while services enforce ownership and mentor-assignment constraints for individual resources.
- **How prerequisites work:** directed relationships represent “must build this prerequisite before that skill.” Creation checks prevent self-links and cycles, while the graph and recommendation services derive a learner-specific view from stored relationships and current scores.
- **How audit logging works:** high-value administrative and security operations write a durable event with actor/action/entity and bounded, key-filtered metadata. Audit activity can be paginated/searched through admin APIs; secrets and credentials are excluded.
- **Important security choices:** use bcrypt hashes, hashed single-use reset tokens, JWT expiry and auth-version invalidation, server-side authorization, strict input validation, configured-origin CORS, Helmet, endpoint rate limits, request-size limits, safe error envelopes, and request IDs. Secrets stay in backend runtime configuration.
- **Technical challenges addressed:** keeping scoring explainable while incorporating verification and evidence recency; preserving prior score calculations during recalculation/rule changes; keeping mentor access constrained to assignments; and returning graph structures that remain usable by React Flow. The implementation reuses existing models and service boundaries rather than introducing parallel frontend business logic.

## Known limits

- Frontend automated tests are not configured; route and component regressions are currently guarded by the production build and backend API tests.
- A local Docker engine and deployment credentials are required to validate image execution and a real deployment; CI image builds do not verify external MongoDB/SMTP configuration.
- The API health endpoint is a process/API check, not a dependency-readiness dashboard.
- In-memory rate limiting is not shared between replicas. Configure a shared store or edge limit before relying on it in a multi-instance deployment.
