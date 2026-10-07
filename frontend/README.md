# SkillTrack frontend

React, JavaScript/JSX, and Vite frontend with separate student, mentor, and admin workspaces.
Role-protected routes preserve the API-provided account role. The existing service layer
handles API requests; Recharts visualizes learner progress, and React Flow powers the admin
skill prerequisite graph.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`; preview it with `npm run preview`.

## Connect the backend

Start the API in `../backend` (see its README) and configure the frontend API URL if it is not running at `http://localhost:5000/api/v1`:

```sh
# .env.local
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

The sign-in form has no role selector; the API returns the account role and the frontend routes to the matching workspace. Authentication uses the API's JWT, stored in tab-scoped session storage. The frontend defaults to the versioned `/api/v1` API paths. For local administrator access, seed the backend with the credentials configured in its environment.
