# Spec: Admin Web Console

React 18 + TypeScript SPA. Served at `/admin/` via Caddy.

## Pages

| Page | Route | Auth | Key API calls |
|---|---|---|---|
| Bootstrap | (root, pre-auth) | none | POST /bootstrap |
| Login | (root, pre-auth) | none | POST /auth/login |
| Dashboard | / | token | GET /rtc/stats |
| Identities | /identities | token | GET/POST/DELETE /admin/identities |
| Rooms | /rooms | token | GET/POST/DELETE /rooms |
| Invites | /invites | token | POST /invites |

## Auth

Bearer token in localStorage (`openspace_token`). 401 clears token and redirects to login.

## Init Flow

GET /bootstrap/status → not bootstrapped → BootstrapPage
                      → bootstrapped + no token → LoginPage
                      → bootstrapped + token → admin router
