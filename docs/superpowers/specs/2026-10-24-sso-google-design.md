# Single sign-on with Google for *.quentinvanderlinden.dev

Date: 2026-10-24
Status: design approved in conversation; spec awaiting review

## Intent

fisac has no authentication. It is about to be deployed at
`fisac.quentinvanderlinden.dev`, and more apps will follow on other
subdomains. Rather than build login into fisac, one shared service signs
people in for every `*.quentinvanderlinden.dev` app.

What the user decided while designing it:

- One authentication service for all apps, not something specific to fisac.
- Sign-in with Google only.
- Not every Google account may sign in: only allow-listed e-mail addresses.
- An existing open-source service is preferred over writing one:
  **oauth2-proxy** was chosen (Authentik judged oversized for a short allow
  list; Authelia cannot delegate sign-in to Google).
- The service lives in its **own new repository**.
- Apps can read the signed-in user's first and last name.

Hosting, as stated by the user: Coolify on a VPS, behind Coolify's Traefik,
with `*.quentinvanderlinden.dev` pointing at that server.

Assumptions (not stated, correct them if wrong): a handful of users at most;
no roles, being signed in and on the list grants full access to an app;
one allow list shared by all apps.

Success:

- Opening `https://fisac.quentinvanderlinden.dev` without a session sends the
  browser through Google and back to the page it asked for; an allow-listed
  account then uses fisac normally, a Google account not on the list is
  refused.
- Signing in once covers every protected subdomain; signing out signs out
  of all of them.
- fisac's `/api/*` refuses any request that does not carry a valid Google ID
  token issued to the service's client, even one that bypasses Traefik.
- fisac shows the user's name (and avatar) and a sign-out link.
- Protecting a new app takes labels in Coolify, no code.

## Scope

In:

1. A new repository holding the oauth2-proxy deployment for Coolify.
2. fisac: ID-token verification on every `/api` route, `GET /api/me`, the
   401 handling and user display in the frontend, the Coolify labels, docs.

Out: roles or per-app allow lists, an admin UI, other identity providers,
self-hosted session storage (Redis), protecting apps other than fisac (the
README explains how), creating the Google OAuth client and the DNS record
(manual steps the README lists).

## Part 1: the shared service (new repository)

Proposed name: `auth` (owner `qvanderlinden`).

### Contents

```
auth/
  docker-compose.yml   # the oauth2-proxy service, for Coolify
  emails.txt           # the allow list, one e-mail per line
  README.md            # setup, protecting an app, adding a user
```

`docker-compose.yml` runs the official image
`quay.io/oauth2-proxy/oauth2-proxy`, pinned to the latest v7 release at
implementation time. Configuration is by flags or `OAUTH2_PROXY_*`
environment variables in the compose file; secrets come from Coolify
environment variables and never sit in the repository:
`OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_CLIENT_SECRET`,
`OAUTH2_PROXY_COOKIE_SECRET` (32 random bytes, base64).

`emails.txt` is mounted read-only into the container. Adding or removing
someone is a commit and a redeploy in Coolify; sessions live in the cookie,
so a redeploy signs nobody out. A removed user keeps access until their
current ID token expires (at most an hour, the next refresh is refused).

### oauth2-proxy configuration

| Setting | Value | Why |
|---|---|---|
| `provider` | `google` | Google sign-in; supports refresh tokens |
| `scope` | `openid email profile` | `profile` puts `name`, `given_name`, `family_name`, `picture` in the ID token |
| `redirect-url` | `https://auth.quentinvanderlinden.dev/oauth2/callback` | the one redirect URI registered on the Google client |
| `authenticated-emails-file` | `/etc/oauth2-proxy/emails.txt` | the allow list |
| `email-domain` | **not set** | `*` would let any Google account in; the allow list must be the only rule |
| `cookie-domain` | `.quentinvanderlinden.dev` | one session for every subdomain |
| `cookie-secure`, `cookie-httponly` | `true` | |
| `cookie-samesite` | `lax` | survives the top-level redirect back from Google |
| `cookie-expire` | `168h` | sign in about once a week |
| `cookie-refresh` | `30m` | refreshes the ID token (valid 1 h) before apps reject it |
| `whitelist-domain` | `.quentinvanderlinden.dev` | `rd=` redirects only to our subdomains, no open redirect |
| `reverse-proxy` | `true` | required behind Traefik; reads `X-Forwarded-*` |
| `trusted-proxy-ip` | the Coolify Docker network's CIDR | only Traefik may supply `X-Forwarded-*` |
| `upstream` | `static://202` | forward-auth mode: answer 202 instead of proxying |
| `skip-provider-button` | `true` | go straight to Google, no oauth2-proxy sign-in page |
| `set-authorization-header` | `true` | the auth response carries `Authorization: Bearer <id_token>` |
| `set-xauthrequest` | `true` | the auth response carries `X-Auth-Request-Email` and `-User` |
| `http-address` | `0.0.0.0:4180` | |

Sessions are kept in the cookie (no Redis). The cookie holds the ID,
access and refresh tokens and goes over 4 KB; oauth2-proxy splits it into
`_oauth2_proxy_0`, `_1`, … on its own.

### Traefik: routers and middlewares

The compose file's labels define, through Coolify's Traefik (Docker
provider, so the names are global as `name@docker`):

- the router for `Host(auth.quentinvanderlinden.dev)` to oauth2-proxy on
  port 4180, with TLS by Coolify's resolver;
- middleware **`sso`**: `forwardAuth` to `http://<oauth2-proxy service>:4180/`
  (the static upstream). With a valid session it answers 202 and Traefik
  lets the request through; without one it answers a redirect to Google
  that Traefik returns to the browser. `trustForwardHeader: true`,
  `authResponseHeaders: Authorization, X-Auth-Request-Email, X-Auth-Request-User`;
- middleware **`sso-api`**: `forwardAuth` to
  `http://<oauth2-proxy service>:4180/oauth2/auth`, same headers. Without a
  session it answers **401** instead of a redirect, which is what a `fetch`
  needs (a redirect to Google would fail on CORS and tell the app nothing).

Both addresses use the internal Docker network, never the public URL.

### Protecting an app (README)

For an app at `<app>.quentinvanderlinden.dev` in Coolify:

1. Its main router gets `traefik.http.routers.<router>.middlewares=sso@docker`.
2. If the app has an API that the browser calls with `fetch`, add a second
   router for `Host(<app>.quentinvanderlinden.dev) && PathPrefix(/api)`,
   same service, higher priority, with `middlewares=sso-api@docker`.
3. The app's port is not published on the host (Coolify's default), so
   Traefik is the only way in.
4. To trust the identity, the app verifies the Google ID token in
   `Authorization` (signature, `iss`, `aud` = the client ID, `exp`); it may
   read the e-mail from `X-Auth-Request-Email` only for display.

Sign-out link for any app:
`https://auth.quentinvanderlinden.dev/oauth2/sign_out?rd=<url>`. It clears
the shared cookie, so it signs the user out of every app.

### One-time manual steps (README)

1. Google Cloud Console: an OAuth client of type "Web application", redirect
   URI `https://auth.quentinvanderlinden.dev/oauth2/callback`, consent screen
   in "External" with the scopes above. Its client ID is also given to apps.
2. DNS: `auth.quentinvanderlinden.dev` (already covered if the wildcard
   points at the VPS).
3. Coolify: the repository as a Docker Compose resource, the three secrets,
   the Docker network CIDR for `trusted-proxy-ip`.

### Verification of part 1

On the deployed service, by hand, written up in the README as a checklist:

- an allow-listed account signs in and is sent back to the page it asked for;
- an account not on the list is refused with oauth2-proxy's 403 page;
- `curl` on a protected API path without a cookie gets 401, on a page gets a
  302 to `accounts.google.com`;
- `rd=https://evil.example` is not followed;
- after an hour and a half of inactivity in an open tab, API calls still
  pass (the refresh works);
- sign-out on one app signs the user out of another.

## Part 2: fisac

### Backend

New module `backend/src/fisac/auth.py`:

- `User`: a frozen dataclass or pydantic model with `email`, `name`,
  `given_name`, `family_name`, `picture`. All but `email` may be `None`
  (some Google accounts have no family name; the frontend falls back to
  the e-mail).
- `current_user(request) -> User`, a FastAPI dependency:
  - when `settings.auth_disabled`, returns a fixed `User(email="dev@localhost",
    name="Dev", …)`;
  - otherwise reads `Authorization: Bearer <token>`; a missing header or a
    token that fails verification raises a 401 (`ApiError` with a French
    message, through the existing handler);
  - verifies with PyJWT: `PyJWKClient("https://www.googleapis.com/oauth2/v3/certs")`
    (it caches the keys and refetches when an unknown `kid` arrives),
    algorithm `RS256`, `audience = settings.google_client_id`,
    issuer `https://accounts.google.com` or `accounts.google.com` (Google
    uses both), `exp` required, leeway 30 s; the JWKS URL is a setting so
    tests can point it at a local key set;
  - requires `email_verified` to be true.
- The allow list is not repeated here: an ID token whose audience is the
  service's client can only be obtained through oauth2-proxy, which applies
  the list. The backend's check is the guarantee that a request reaching
  fisac without going through Traefik is refused.

`config.py` gains `google_client_id: str = ""`, `auth_disabled: bool = False`
and `google_jwks_url` (default Google's). Authentication is **on by
default**. At startup, if it is on and `google_client_id` is empty, the app
fails to start rather than refusing every request silently.

`main.py` passes `dependencies=[Depends(current_user)]` to every
`include_router(..., prefix="/api")`, so no route can be left out by
accident; a new router `me.py` adds `GET /api/me`:

```json
{
  "email": "quentin.vanderlinden@gmail.com",
  "name": "Quentin Vanderlinden",
  "given_name": "Quentin",
  "family_name": "Vanderlinden",
  "picture": "https://lh3.googleusercontent.com/…"
}
```

The frontend mount (`app.frontend`) gets no dependency: the static assets
are protected by Traefik's `sso` middleware, and they hold no data.

Dependency: `PyJWT[crypto]` (pulls `cryptography`) in `pyproject.toml`,
`uv.lock` regenerated with `uv lock`.

### Frontend

`src/api/client.ts`: when a response is a 401, the client sends the browser
to `https://auth.<parent domain>/oauth2/start?rd=<encoded location.href>`
and the call never settles (the page is leaving). The parent domain is
`location.hostname` without its first label (`fisac.quentinvanderlinden.dev`
gives `quentinvanderlinden.dev`). A small `src/auth.ts` holds this
`signInUrl()` and `signOutUrl()` (`…/oauth2/sign_out?rd=<origin>`), unit
tested.

The navigation must leave the app's origin. The PWA's service worker answers
navigations with the cached `index.html`, so a plain reload would never
reach Traefik and the user would loop on a shell whose every call fails. A
URL on `auth.` is not handled by fisac's service worker.

Accepted consequence: without a session, the installed PWA can show the
cached empty shell for a moment before the first API call redirects to
Google. No data is exposed; all of it comes from `/api`.

The shell (`src/shell/AppShell.tsx`) loads `/api/me` once at start and
shows, in the existing navigation, the avatar (the design system's avatar
component if it has one, initials otherwise) and the name (`name`, else
`given_name family_name`, else `email`), with a "se déconnecter" link to
`signOutUrl()`. It follows the design system rules in CLAUDE.md (package
components first, brand utilities, Lucide icons, French copy, lowercase in
navigation).

With `AUTH_DISABLED=true` locally, `/api/me` answers the dev user and no
401 ever happens, so `npm run dev` and `npm run smoke` work as today.

### Coolify setup for fisac (documented in CLAUDE.md "Deployment")

- Environment: `GOOGLE_CLIENT_ID` (the same client ID as the auth service).
- Labels: `sso@docker` on the main router, a second router on
  `PathPrefix(/api)` with `sso-api@docker`, as in the auth README.
- No published host port.

### Tests

Backend (pytest):

- the existing suites run with authentication disabled
  (`AUTH_DISABLED=true` set by the test configuration), unchanged;
- a new `test_auth.py` runs with authentication on, generates an RSA key
  pair, serves its JWKS from a local file or stub (`google_jwks_url`
  pointed at it), and signs tokens. It checks:
  - no `Authorization` header gets 401;
  - a token signed by another key gets 401;
  - a token with another audience gets 401;
  - an expired token gets 401;
  - `email_verified: false` gets 401;
  - a valid token gets 200 on a business route;
  - `/api/me` returns the claims, with missing names as `null`;
- a test that every `/api` route of the app depends on `current_user`
  (walks `app.routes`), so a router mounted later without it fails.

Frontend (vitest): `auth.ts` URL building; `client.ts` redirects on 401
(`location.assign` spied) and still throws `HttpError` on other statuses.

`npm run build`, `npm run test`, `npm run check:design`, `uv run pytest`
and `npm run smoke` (auth disabled) pass.

## Order of work

1. Part 1: create the repository, write the compose file, the allow list
   and the README; the user creates the Google client and deploys it in
   Coolify; run the part 1 checklist.
2. Part 2: fisac's backend, then frontend, then docs; the user sets
   `GOOGLE_CLIENT_ID` and the labels on fisac in Coolify; check the success
   criteria on `fisac.quentinvanderlinden.dev`.

Part 2 can be written and tested locally before part 1 is deployed;
only its final check needs part 1 live.
