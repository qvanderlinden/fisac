# Clerk authentication: design

## Intent

fisac has no authentication: anyone who reaches the API can read and change the
books. Its owner plans several applications on subdomains of one domain (for
example `fisac.yourdomain.be`, `other.yourdomain.be`) and wants people to log in
once and be signed in on all of them.

Clerk answers one question only: who is this person? What they may do is each
application's business, decided in that application, when it needs to.

fisac is used by 2 or 3 people (the owner, perhaps an accountant), all with the
same rights on the same books. It has no roles, and none are designed here.

## Goals

- Every `/api` route refuses a request without a valid Clerk session for fisac.
- A signed-out visitor is sent to the sign-in page and comes back signed in.
- Someone already signed in on a sibling application is signed in on fisac,
  with no further prompt.
- People can sign out and reach their Clerk account settings from the shell.
- No one can create their own account.

## Non-goals

- Roles, permissions, or any per-application access check.
- A users table, or recording who changed what.
- Admin screens for users. People are invited from the Clerk dashboard.
- Changes to any other application, including moving `expenses-tracker` off Dex
  and removing Dex and oauth2-proxy, which the owner plans once Clerk is set up.
- Scheduled database backups (the owner's decision).

## Anti-goals

These would make this a failure even if sign-in works:

- A flag or environment variable that turns authentication off. Tests replace
  the dependency in-process; nothing reachable in a running server skips it.
- A router that can be mounted without protection by forgetting a line.
- A secret in the frontend bundle or in an image layer.
- Roles or access data stored in Clerk (the owner decided against this).

## Decisions by the owner

- Clerk does authentication only; authorization lives in each application.
- All applications share one Clerk application (so one user list and one
  session), on subdomains of one domain. No satellite domains.
- The sign-in page is Clerk's hosted Account Portal, and it stays in English.
- Sign-in methods are whatever is configured in the Clerk dashboard. fisac's
  code does not depend on them.

## Known limit, accepted

Because the user list is shared, anyone invited for another application can
sign in to fisac and has full access to the books. This is fine while the same
few people use everything. A per-application access check is needed in fisac
before inviting anyone who should not see the books.

## Clerk configuration (dashboard, not code)

- One Clerk application. Development instance for local work; production
  instance later, with the root domain set so subdomains share the session.
- Sign-up mode **Invite-only** (API value `restricted`). The docs and pricing page
  do not say which plans include it. If the plan lacks it, use **Waitlist**, which
  the pricing page lists on every plan: nobody gets an account without approval
  either way. Open public sign-up must not be used, because nothing in fisac's
  code would stop such an account. (Builder's call.)
- Production: restrict the subdomains allowed to call the Frontend API, as
  Clerk recommends.
- Passkeys cannot be shared between sibling subdomains (WebAuthn rule), so if
  they are enabled, each application's passkey is its own.

## Backend

### Verification

New module `backend/src/fisac/auth.py` exposes a FastAPI dependency.

- Library: `clerk-backend-api` 7.x (7.1.0 resolves on Python 3.14; its
  `cryptography` pin is `>=50,<51`). Use its `authenticate_request` with
  `AuthenticateRequestOptions(jwt_key=..., authorized_parties=[...])`.
- **Networkless:** with `jwt_key` the SDK makes no HTTP call, so the
  synchronous function does not block the event loop on I/O, requests do not
  depend on Clerk's availability, and the server holds no Clerk secret key.
  Tradeoff: if Clerk's signing key is rotated, `CLERK_JWT_KEY` must be updated.
- **Bearer only:** the SDK falls back to the `__session` cookie when there is
  no `Authorization` header. Hand it a minimal object whose `headers` hold only the
  incoming `Authorization` header, so cookies are never read and a cross-site
  form post cannot authenticate. (Not an `httpx.Request`, which raises on a
  non-ASCII header value.)
- **Authorized parties:** always set, from configuration. A token issued for a
  sibling application must be refused, which is what stops a compromised sibling
  from acting on fisac.
- Anything other than a signed-in state answers
  `401 {"detail": "Non authentifié"}` with `WWW-Authenticate: Bearer`. The
  reason is not exposed to the client. Tokens are never logged.
- The dependency returns the token's `sub` (Clerk user id). Nothing uses it yet;
  it is the seam for a later access check.

### Applying it to every route

`main.py` gathers all routers in one
`APIRouter(prefix="/api", dependencies=[Depends(...)])`, mounted on the app. The
routers themselves do not change. A test walks `app.routes` and fails if any
`/api` route lacks the dependency. The frontend static mount stays public: it
holds no data.

### Configuration

Added to `Settings` and `.env.example`:

- `CLERK_JWT_KEY`: the PEM public key from the dashboard's API keys page. The
  value must survive being a single-line environment variable (accept literal
  `\n`).
- `CLERK_AUTHORIZED_PARTIES`: comma-separated origins, split into a list (the
  SDK needs a list; an unsplit string refuses every request). Locally
  `http://localhost:5173`.

Both are required to serve. The app refuses to start when either is empty,
rather than answering 401 to everyone. The check must not run when Alembic
imports the settings, so that migrations need no Clerk configuration.

## Frontend

### Provider and gate

- Dependency `@clerk/react` (current major; its peer range accepts the installed
  React 19.2.7). `ClerkProvider` wraps the app in `main.tsx`, with the publishable
  key from `VITE_CLERK_PUBLISHABLE_KEY`.
- A gate in `App.tsx` sits outside `FiscalYearProvider`, which calls the API on
  mount. While Clerk loads it shows a quiet loading state; signed out, it renders
  `<RedirectToSignIn />`; signed in, it renders the app. No screen and no API call
  happens before the session is known.
- After signing in, the person returns to the URL they asked for.

### API client

`src/api/client.ts` is a plain module used outside React, so it gets the token
through functions registered by the gate:

- Before each request it asks for a token (Clerk caches and refreshes it) and
  sends `Authorization: Bearer <token>`.
- **Ordering trap:** React runs child effects before parent effects, so
  registering in a `useEffect` in the gate would lose the race with the first
  screen's fetch. Register before the children render.
- A 401 is an ordinary `HttpError`, shown like any other API error. Only the gate
  redirects, and only when Clerk itself says the person is signed out. (Builder's
  call, to avoid a loop: a rotated `CLERK_JWT_KEY` or a wrong
  `CLERK_AUTHORIZED_PARTIES` makes the API refuse a session Clerk still considers
  valid, and redirecting would likely bounce straight back, locking everyone out.)
- A failed token request while offline must surface as the existing "server
  unreachable" message in `errors.ts`, not as a new error.
- If Clerk has not loaded after about 10 seconds, the gate shows a French
  "service unreachable" message instead of loading forever. fisac does not work
  offline or during a Clerk outage; it needs its API anyway. (Builder's call.)

### Account control

A small control in the shell (desktop sidebar and mobile drawer) shows the
person's name or email, with "Mon compte" (Clerk's hosted account page) and "Se
déconnecter". It is built from `@qvanderlinden/ui` rather than Clerk's
`UserButton`, so that it is French and on-brand. Signing out returns to the
sign-in page.

### PWA

`/api` is already excluded from the service worker's navigation fallback, and
API responses are not cached, so no books data is stored for a signed-out
visitor. The precached shell holds no data. Check that the redirect to the
accounts domain and back works from the installed PWA.

## Build and environment

- The publishable key is public but baked in at build time. The Dockerfile's
  `npm run build` step mounts it the same way as `NODE_AUTH_TOKEN`
  (`--mount=type=secret,id=VITE_CLERK_PUBLISHABLE_KEY,env=VITE_CLERK_PUBLISHABLE_KEY,required=true`),
  because Coolify's "Use Docker Build Secrets" passes build variables as secrets, and
  a missing key should fail the build, not produce a blank page. The build command
  in the docs gains a second `--secret`. (Builder's call; replaces a build argument.)
- `CLERK_JWT_KEY` and `CLERK_AUTHORIZED_PARTIES` are runtime environment variables
  of the container, never build inputs.
- Local: the publishable key goes in `frontend/.env.local`, which is not
  gitignored yet; add the rule.
- `CLERK_SECRET_KEY` is needed only by the smoke test, on a development instance.
  It is not an application setting.

## Testing

Backend (`uv run pytest`; needs no Clerk account or network):

- `conftest.py` sets the two settings and overrides the dependency for the
  existing test client, so the existing suites are unchanged.
- New `test_auth.py` runs without the override, with an RSA key generated in the
  test that signs real tokens. It covers: no header; garbage token; expired; signed by
  another key; wrong `azp`; valid `__session` cookie and no header (must be 401);
  valid token (passes). Plus the walk over `app.routes`.

Frontend (`npm run test`): the client sends the header; a 401 throws `HttpError`
without redirecting; a token failure gives the existing unreachable message.

Smoke (`npm run smoke`): drives a real sign-in against a development instance,
using `@clerk/testing` (Testing Tokens, email and password enabled, a test user).
It adds one check that a signed-out visit ends on the sign-in page. Unknowns for
the builder: the docs show only `@playwright/test`, which is its peer dependency,
while `smoke.mjs` uses plain `playwright` pinned at 1.56.1; and each `newPage`
is a separate browser context, so reuse a signed-in storage state. The smoke
needs Clerk development keys and cannot run without them.

## Documentation

`CLAUDE.md`, `README.md` and `.env.example` are updated: the new variables, the
build argument, smoke prerequisites, the known limit above, and the deployment
(`CLAUDE.md` currently says deployment is not configured).

## Deployment

The owner asked for fisac to run in Coolify at
`https://fisac.quentinvanderlinden.dev`, deploying automatically on every push to
`main`. Coolify is at `coolify.quentinvanderlinden.dev`, and its API key is in the
environment as `COOLIFY_API_KEY`.

**Already deployed, without login.** The owner chose to deploy `main` before this
work, since no real data exists yet. The application has been live and open to
anyone since 2026-11-06, so no real data goes in until this work ships.

**The order matters for shipping this work.** Every merge to `main` goes live and
applies its migrations, and the app will refuse to start without its Clerk
settings. So:

1. Authentication is built and tested against the Clerk development instance.
2. The Clerk production instance exists and its DNS records are live (below).
3. The Clerk variables are set in Coolify.
4. The branch is merged to `main`, when the owner says so.

### Coolify application (as set up)

- `fisac` in project `Personal Tools`: Dockerfile build from `qvanderlinden/fisac`,
  branch `main`, on port 8000, through the `qv-coolify` GitHub App. "Use Docker
  Build Secrets" is on, because the Dockerfile mounts `NODE_AUTH_TOKEN` as a
  BuildKit secret.
- Postgres `fisac-postgres`, reachable only inside the Coolify network. Set a
  database password when creating the resource: with `instant_deploy` the volume
  is initialised at once, and updating the password later does not change it.
- Build inputs: `NODE_AUTH_TOKEN`, and to add `VITE_CLERK_PUBLISHABLE_KEY`
  (`pk_live_`).
- Runtime variables: `DATABASE_URL`, and to add `CLERK_JWT_KEY` and
  `CLERK_AUTHORIZED_PARTIES=https://fisac.quentinvanderlinden.dev`.
- Secrets are set in Coolify and never committed.

### Clerk production instance

The owner creates it in the Clerk dashboard, with `quentinvanderlinden.dev` as the
root domain, then adds the DNS records it lists. These records must be "DNS only"
in Cloudflare. A wildcard currently answers for every subdomain through Cloudflare,
so `clerk.` and `accounts.` appear to resolve already, but they do not point at
Clerk until those records exist.

## What counts as done

fisac runs at its address, refuses anyone not signed in, a real sign-in works
there, and a push to `main` redeploys it. Two things need a second application, so
they go on a short handover list and are not verified here: session sharing with a
sibling, and sign-out reaching siblings. The redirect from an installed PWA is
checked on the production address. (Builder's call.)

## Verified while building

- A session token lasts 60 seconds on the development instance. After signing out,
  an already issued token keeps working until it expires, then gets a 401, because
  verification is offline. So signing out, or removing someone, takes effect on the
  API within about a minute. Check the lifetime on the production instance.
- Clerk's "client trust" asks for an emailed code when a password sign-in comes from a
  new device.

Still open, needing a second application: that signing out of fisac signs out of
sibling applications (expected, as they share a session).

## Left to the builder

File layout within these boundaries, the loading state's look, the exact
placement of the account control, and test helper structure.
