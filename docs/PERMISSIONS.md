# Permissions

Access is decided by two attributes of a dashboard user: a **team level** (0-7) and a **super user** flag. This document describes what the code does today. Sources: `worker/src/lib/mocoMapping.ts`, `worker/src/middleware/auth.ts`, `dashboard/src/components/ProtectedRoute.tsx`.

## Team levels

The team level comes from the user's unit in MOCO. `mapMocoUnitToTeamLevel` matches the unit name against a numbered hierarchy (`"<NN>. <role>"`) with role keywords. The mapping shipped here follows a German consulting hierarchy. Change it to match your own units.

| Level | Role keyword in the MOCO unit name |
|-------|------------------------------------|
| 0 | intern / working student (`prakti`, `werki`) |
| 1 | analyst |
| 2 | consultant (`berater`) |
| 3 | senior consultant |
| 4 | manager |
| 5 | senior manager |
| 6 | associate partner / director |
| 7 | partner |

Units containing `freelancer`, `admin` or `p&c` map to level 0. Unknown names map to level 0 and log a warning. If the name has a numeric prefix (`"3. ..."`), the prefix is used as a fallback.

The effective level of a dashboard user is derived from the live MOCO unit on every request (`resolveDashboardTeamLevel`). The stored `teamLevel` is only used when the unit is missing or is one of the filtered units above.

## Super user

The super user flag is independent of the team level. It is set per dashboard user (`PUT /api/admin/users/:id`) and grants:

- access to every team level in all data endpoints,
- access to all `/api/admin/*` endpoints and to the session endpoints,
- access to the admin and overview pages in the frontend.

## Data visibility

A user sees people whose level is **strictly below** their own level (`getVisibleTeamLevelsForUser`). Super users see all levels 0-7.

| Own level | Visible levels |
|-----------|----------------|
| 0 | none |
| 1 | 0 |
| 3 | 0, 1, 2 |
| 7 | 0-6 |
| super user | 0-7 |

The rule is applied in the worker for the user list, timeline, capacity, bottleneck, project and gantt endpoints, and in the frontend for the default team filter. Projects and bookings are not filtered separately; they follow from the visible users.

## Endpoint and page access

| Area | Requirement |
|------|-------------|
| `POST /api/auth/login`, `verify-2fa`, `resend-2fa`, `accept-invite` | none (rate limited) |
| `GET /api/auth/me`, `POST /api/auth/heartbeat`, `POST /api/auth/logout` | valid JWT |
| Timeline, users, activities, avatars | valid JWT, filtered by visibility |
| `GET /api/schedules` | any authenticated user |
| `/api/admin/*` | valid JWT and super user |
| `GET /api/users/:userId/sessions` | valid JWT and super user |
| Frontend `/timeline`, `/profile`, `/settings` | logged in |
| Frontend `/dashboard` (overview), `/admin/users`, `/admin/sessions` | logged in and super user |

`requireAdminLevel(n)` exists in the middleware (super user or team level >= n) but is not used by any route at the moment.

## Implementation notes

- Backend guards: `authMiddleware` (JWT, user must exist and be active), `requireSuperUser()`, `requireAdminLevel(n)`.
- Frontend: `ProtectedRoute` takes `requiresSuperUser` and `minTeamLevel`. The sidebar hides entries the user cannot open. The frontend checks are a convenience; the worker enforces access.
- The frontend has its own copy of the unit mapping (`dashboard/src/lib/mocoMapping.ts`). Both copies must stay in sync.
- Tests: `worker/src/lib/mocoMapping.test.ts` and `worker/src/middleware/auth.test.ts`.
