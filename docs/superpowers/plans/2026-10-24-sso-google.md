# Google single sign-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect fisac (and any future `*.quentinvanderlinden.dev` app) behind one shared oauth2-proxy that signs allow-listed Google accounts in, with fisac verifying the Google ID token and showing who is signed in.

**Architecture:** A new repository `qvanderlinden/auth` deploys oauth2-proxy on Coolify at `auth.quentinvanderlinden.dev`; its compose labels define two global Traefik `forwardAuth` middlewares, `sso` (redirects to Google) and `sso-api` (answers 401). fisac's routers get those middlewares by Coolify labels; its FastAPI app verifies the `Authorization: Bearer <id_token>` oauth2-proxy adds, exposes `GET /api/me`, and its frontend sends the browser to `auth.` on any 401.

**Tech Stack:** oauth2-proxy v7 (Docker), Traefik via Coolify, FastAPI + PyJWT[crypto], React 19 + `@qvanderlinden/ui`, vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-24-sso-google-design.md`

## Global Constraints

- Cookie domain `.quentinvanderlinden.dev`; redirect URI `https://auth.quentinvanderlinden.dev/oauth2/callback`.
- `email-domain` is never set; `authenticated-emails-file` is the only allow rule.
- Scopes `openid email profile`; `cookie-expire` `168h`, `cookie-refresh` `30m`, `cookie-samesite` `lax`.
- No secret in either repository: `OAUTH2_PROXY_CLIENT_ID`, `OAUTH2_PROXY_CLIENT_SECRET`, `OAUTH2_PROXY_COOKIE_SECRET`, `GOOGLE_CLIENT_ID` come from Coolify.
- fisac authentication is **on by default**; only `AUTH_DISABLED=true` turns it off; on with an empty `GOOGLE_CLIENT_ID` the app refuses to start.
- ID token checks: `RS256`, `aud` = `GOOGLE_CLIENT_ID`, `iss` in {`https://accounts.google.com`, `accounts.google.com`}, `exp` required, leeway 30 s, `email_verified` true.
- Default JWKS URL `https://www.googleapis.com/oauth2/v3/certs`.
- Frontend copy French; the sign-out link reads « se déconnecter » (lowercase, as navigation); design-system rules of `CLAUDE.md` (package components, brand utilities, Lucide icons, no raw colour).
- Python ≥ 3.14, deps via `uv`; frontend checks `npm run build`, `npm run test`, `npm run check:design`.
- Commits end with the session's attribution lines.

## Review Focus

1. A Google account **not** on the list completes Google's consent — it must get oauth2-proxy's 403, never a session cookie (Task 2 checklist line 2).
2. An `/api` route mounted later without the dependency — must still be refused; pinned by `test_every_api_route_requires_auth` (Task 3).
3. A token without `kid`, with `alg: none` or `HS256` signed with the public key — 401, not 500; pinned by `test_unsigned_or_hs256_token_is_refused` (Task 3).
4. The JWKS endpoint unreachable — 401 with a clear message, not a 500 trace; pinned by `test_unreachable_jwks_is_401` (Task 3).
5. A 401 while the page is on a host with no parent domain (`localhost`, an IP) — must not navigate to `https://auth.localhost`; pinned by `signInUrl` returning `undefined` there and the client throwing `HttpError` instead (Task 4).

---

## Part 1 — the shared service (new repository)

### Task 1: Repository `qvanderlinden/auth` with the oauth2-proxy compose

**Files (in the new repository):**
- Create: `docker-compose.yml`
- Create: `emails.txt`
- Create: `README.md`
- Create: `.gitignore` (`.env`)

**Interfaces:**
- Produces: Traefik middlewares `sso@docker` and `sso-api@docker`; the response headers `Authorization`, `X-Auth-Request-Email`, `X-Auth-Request-User` (consumed by Task 3 and the fisac labels of Task 6).

- [ ] **Step 1: Create the repository** — ask the user to confirm, then create the private repository `qvanderlinden/auth` (GitHub MCP `create_repository`, or the user creates it), add it to the session with `add_repo` (access `push`) and clone it next to fisac.

- [ ] **Step 2: Write `emails.txt`** — one line: `quentin.vanderlinden@gmail.com`.

- [ ] **Step 3: Write `docker-compose.yml`**

One service `oauth2-proxy`, image `quay.io/oauth2-proxy/oauth2-proxy:<latest v7.x.y tag>` (look the tag up on the GitHub releases page; pin the exact tag, never `latest`), `expose: ["4180"]` (no `ports:`), `./emails.txt` mounted read-only at `/etc/oauth2-proxy/emails.txt`, and configuration as `OAUTH2_PROXY_*` environment variables with the values of the spec's configuration table (`PROVIDER=google`, `SCOPE`, `REDIRECT_URL`, `AUTHENTICATED_EMAILS_FILE`, `COOKIE_DOMAINS`, `COOKIE_SECURE`, `COOKIE_HTTPONLY`, `COOKIE_SAMESITE`, `COOKIE_EXPIRE`, `COOKIE_REFRESH`, `WHITELIST_DOMAINS`, `REVERSE_PROXY`, `TRUSTED_PROXY_IPS=${TRUSTED_PROXY_IPS}`, `UPSTREAMS=static://202`, `SKIP_PROVIDER_BUTTON`, `SET_AUTHORIZATION_HEADER`, `SET_XAUTHREQUEST`, `HTTP_ADDRESS=0.0.0.0:4180`); the three secrets as `${…}` references. No `OAUTH2_PROXY_EMAIL_DOMAINS`. Labels (the router for `auth.` itself is created by Coolify from the domain set in its UI):

```yaml
labels:
  - traefik.enable=true
  - traefik.http.middlewares.sso.forwardauth.address=http://oauth2-proxy:4180/
  - traefik.http.middlewares.sso.forwardauth.trustForwardHeader=true
  - traefik.http.middlewares.sso.forwardauth.authResponseHeaders=Authorization,X-Auth-Request-Email,X-Auth-Request-User
  - traefik.http.middlewares.sso-api.forwardauth.address=http://oauth2-proxy:4180/oauth2/auth
  - traefik.http.middlewares.sso-api.forwardauth.trustForwardHeader=true
  - traefik.http.middlewares.sso-api.forwardauth.authResponseHeaders=Authorization,X-Auth-Request-Email,X-Auth-Request-User
```

The service joins Coolify's `coolify` network (external) with the alias `oauth2-proxy`, so Traefik reaches it by that name.

- [ ] **Step 4: Validate the compose file**

Run: `docker compose config` (with dummy values exported for the four `${…}` variables)
Expected: exits 0; the output has no `OAUTH2_PROXY_EMAIL_DOMAINS` and no `ports:`.

- [ ] **Step 5: Write `README.md`** — sections, in French: what it is; one-time setup (Google OAuth client "Web application" with the redirect URI, consent screen "External"; DNS; Coolify Docker Compose resource with domain `https://auth.quentinvanderlinden.dev`, the three secrets, `TRUSTED_PROXY_IPS` = output of `docker network inspect coolify -f '{{(index .IPAM.Config 0).Subnet}}'`, "Connect to predefined network" on); adding/removing a user (edit `emails.txt`, commit, redeploy); protecting an app (the four points of the spec's "Protecting an app", with the exact label lines of Task 6 as the worked example); sign-out URL; the verification checklist of Task 2.

- [ ] **Step 6: Commit and push** to `main` of the new repository: `feat: oauth2-proxy for *.quentinvanderlinden.dev`.

### Task 2: Deploy and verify (with the user)

- [ ] **Step 1: User creates the Google OAuth client and the Coolify resource** following the README; Claude reviews the Coolify-generated labels the user pastes back, in particular that the `auth.` router exists and the middlewares are listed on Traefik's dashboard or in `docker logs coolify-proxy` without error.

- [ ] **Step 2: Run the checklist** (README), recording each result:
  1. an allow-listed account signs in and lands back on the page asked for;
  2. a Google account not on the list gets oauth2-proxy's 403 and no `_oauth2_proxy` cookie;
  3. `curl -si https://auth.quentinvanderlinden.dev/oauth2/start?rd=https://evil.example` does not redirect to `evil.example` after login;
  4. after a user is removed from `emails.txt` and the service redeployed, note whether their existing session is refused at once or after the ID token's hour, and write the observed behaviour into the README.

Expected: 1–3 pass. Lines that need a protected app (401 on API, 302 on page, refresh after 1 h 30, sign-out across apps) run in Task 6.

---

## Part 2 — fisac

### Task 3: Backend — ID-token verification, `/api/me`, every router protected

**Files:**
- Create: `backend/src/fisac/auth.py`
- Create: `backend/src/fisac/routers/me.py`
- Modify: `backend/src/fisac/config.py` (three settings)
- Modify: `backend/src/fisac/main.py` (dependency on every `include_router`, `me` router, lifespan check)
- Modify: `backend/tests/conftest.py` (set `AUTH_DISABLED=true` before fisac imports, next to `DATABASE_URL`)
- Modify: `pyproject.toml`, `uv.lock` (`PyJWT[crypto]>=2.10`)
- Modify: `.env.example` (`GOOGLE_CLIENT_ID=`, `AUTH_DISABLED=true` with a comment "local only")
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces:
  - `config.Settings.google_client_id: str = ""`, `auth_disabled: bool = False`, `google_jwks_url: str = "https://www.googleapis.com/oauth2/v3/certs"`.
  - `auth.User` — pydantic `BaseModel`, frozen: `email: str`, `name: str | None`, `given_name: str | None`, `family_name: str | None`, `picture: str | None`.
  - `auth.DEV_USER = User(email="dev@localhost", name="Dev", given_name="Dev", family_name=None, picture=None)`.
  - `auth.current_user(authorization: str | None = Header(default=None)) -> User` — a sync `def` (FastAPI runs it in its threadpool, so PyJWKClient's blocking fetch is fine).
  - `auth.check_settings(s: Settings) -> None` — raises `RuntimeError("GOOGLE_CLIENT_ID est requis quand l'authentification est active")` when auth is on and the client id is empty.
  - `GET /api/me` → `User` as JSON (consumed by Task 5).
  - 401 body: `{"detail": "<French message>"}` via `ApiError(401, …)`.

- [ ] **Step 1: Add the dependency** — `uv add 'PyJWT[crypto]>=2.10'`; Expected: `pyproject.toml` and `uv.lock` updated, `uv run python -c "import jwt, cryptography"` exits 0.

- [ ] **Step 2: Write the failing tests** in `backend/tests/test_auth.py`

A module fixture generates an RSA key (`cryptography`), writes its JWKS (`jwt.algorithms.RSAAlgorithm.to_jwk(public_key, as_dict=True)` plus `kid="test"`, `use="sig"`, `alg="RS256"`) to `tmp_path/jwks.json`; an autouse fixture monkeypatches `settings.auth_disabled=False`, `settings.google_client_id="test-client"`, `settings.google_jwks_url=f"file://{path}"` and clears the JWKS client cache. Helper `token(**overrides)` signs claims `{iss: "https://accounts.google.com", aud: "test-client", sub: "1", email: "q@example.com", email_verified: True, name: "Quentin Vanderlinden", given_name: "Quentin", family_name: "Vanderlinden", picture: "https://example.com/a.png", iat: now, exp: now + 3600}` with header `kid="test"`.

```python
async def test_missing_header_is_401(client):
    r = await client.get("/api/company")
    assert r.status_code == 401

async def test_foreign_key_is_401(client): ...          # signed by a second RSA key, same kid
async def test_wrong_audience_is_401(client): ...       # aud="other-client"
async def test_expired_token_is_401(client): ...        # exp = now - 60 (beyond the 30 s leeway)
async def test_unverified_email_is_401(client): ...     # email_verified=False
async def test_unsigned_or_hs256_token_is_refused(client):
    # alg none, and HS256 signed with the PEM of the public key: both 401
async def test_unreachable_jwks_is_401(client, monkeypatch):
    # google_jwks_url = "file:///nonexistent/jwks.json" -> 401, not 500
async def test_valid_token_reaches_a_route(client):
    r = await client.get("/api/company", headers={"Authorization": f"Bearer {token()}"})
    assert r.status_code == 200
async def test_me_returns_the_claims(client):
    # == {"email": "q@example.com", "name": "Quentin Vanderlinden", "given_name": "Quentin",
    #     "family_name": "Vanderlinden", "picture": "https://example.com/a.png"}
async def test_me_missing_names_are_null(client):
    # token without name/given_name/family_name/picture -> those keys are None
async def test_disabled_returns_dev_user(client, monkeypatch):
    # auth_disabled=True, no header -> /api/me == DEV_USER
def test_every_api_route_requires_auth():
    # for each APIRoute in app.routes whose path starts with "/api":
    #   current_user is among the callables of route.dependant (walk .dependencies recursively)
def test_check_settings_refuses_empty_client_id():
    # Settings(auth_disabled=False, google_client_id="") -> RuntimeError; auth_disabled=True -> no error
```

- [ ] **Step 3: Run them to see them fail**

Run: `uv run pytest backend/tests/test_auth.py -v`
Expected: FAIL (import error on `fisac.auth`).

- [ ] **Step 4: Implement `config.py`, `auth.py`, `routers/me.py`, `main.py`**

`auth.py`: `_jwks_client(url)` is `functools.cache`d and returns `jwt.PyJWKClient(url)`; `current_user` returns `DEV_USER` when disabled, else requires `Bearer `, calls `get_signing_key_from_jwt`, `jwt.decode(token, key, algorithms=["RS256"], audience=…, leeway=30, options={"require": ["exp", "iss", "aud"]})`, checks `iss` membership and `email_verified is True`, and turns every `jwt.PyJWTError` (which covers `PyJWKClientError`) into `ApiError(401, …)`. Messages: missing header « Authentification requise », invalid token « Session invalide ou expirée ».
`main.py`: `AUTH = [Depends(current_user)]` passed as `dependencies=AUTH` to every `include_router` including `me.router`; a `lifespan` that calls `check_settings(settings)`.
`conftest.py`: `os.environ["AUTH_DISABLED"] = "true"` beside `DATABASE_URL`.

- [ ] **Step 5: Run the whole backend suite**

Run: `uv run pytest`
Expected: all pass (existing suites unchanged with auth disabled; `test_auth.py` green).

- [ ] **Step 6: Commit** — `feat(api): verify the Google ID token on every /api route; GET /api/me`

### Task 4: Frontend — sign-in redirect on 401

**Files:**
- Create: `frontend/src/auth.ts`
- Create: `frontend/src/auth.test.ts`
- Modify: `frontend/src/api/client.ts` (`request`)
- Modify: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `authOrigin(hostname: string): string | undefined` — `https://auth.<hostname without its first label>`; `undefined` when the hostname has fewer than three labels or is an IP (`localhost`, `127.0.0.1`, `example.com`).
  - `signInUrl(href: string): string | undefined` — `${authOrigin}/oauth2/start?rd=${encodeURIComponent(href)}`.
  - `signOutUrl(origin: string): string | undefined` — `${authOrigin}/oauth2/sign_out?rd=${encodeURIComponent(origin)}` (consumed by Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// auth.test.ts
expect(authOrigin('fisac.quentinvanderlinden.dev')).toBe('https://auth.quentinvanderlinden.dev')
expect(authOrigin('localhost')).toBeUndefined()
expect(authOrigin('127.0.0.1')).toBeUndefined()
expect(authOrigin('quentinvanderlinden.dev')).toBeUndefined()
expect(signInUrl('https://fisac.quentinvanderlinden.dev/ventes?x=1')).toBe(
  'https://auth.quentinvanderlinden.dev/oauth2/start?rd=https%3A%2F%2Ffisac.quentinvanderlinden.dev%2Fventes%3Fx%3D1')
expect(signOutUrl('https://fisac.quentinvanderlinden.dev')).toBe(
  'https://auth.quentinvanderlinden.dev/oauth2/sign_out?rd=https%3A%2F%2Ffisac.quentinvanderlinden.dev')

// client.test.ts — with vi.stubGlobal('fetch', …) and vi.stubGlobal('location', { href, hostname, assign: vi.fn() })
it('sends the browser to sign in on a 401')       // assign called once with signInUrl(href); the promise stays pending (race it against a 10 ms timer)
it('throws HttpError on a 401 when there is no auth origin') // hostname 'localhost' -> rejects with status 401, assign not called
it('still throws HttpError on a 404')
```

- [ ] **Step 2: Run them to see them fail** — `cd frontend && npx vitest run src/auth.test.ts src/api/client.test.ts`; Expected: FAIL (`./auth` not found).

- [ ] **Step 3: Implement `auth.ts` and the 401 branch in `request`** — on `response.status === 401`, if `signInUrl(location.href)` is defined, `location.assign(it)` and `return new Promise<never>(() => {})`; otherwise fall through to the existing `HttpError`. A short comment says why the navigation leaves the origin (the service worker answers navigations from cache).

- [ ] **Step 4: Run the frontend checks** — `npm run test && npm run check:design`; Expected: pass.

- [ ] **Step 5: Commit** — `feat(frontend): send the browser to sign in on a 401`

### Task 5: Frontend — the signed-in user in the shell

**Files:**
- Create: `frontend/src/shell/UserCard.tsx`
- Create: `frontend/src/shell/displayName.ts`, `frontend/src/shell/displayName.test.ts`
- Modify: `frontend/src/api/types.ts` (`Me`)
- Modify: `frontend/src/shell/AppShell.tsx`

**Interfaces:**
- Consumes: `GET /api/me` (Task 3), `signOutUrl` (Task 4).
- Produces: `type Me = { email: string; name: string | null; given_name: string | null; family_name: string | null; picture: string | null }`; `displayName(me: Me): string`; `initials(me: Me): string`; `<UserCard />`.

- [ ] **Step 1: Write the failing tests** (`displayName.test.ts`)

```ts
expect(displayName({ ...me, name: 'Quentin Vanderlinden' })).toBe('Quentin Vanderlinden')
expect(displayName({ ...me, name: null, given_name: 'Quentin', family_name: null })).toBe('Quentin')
expect(displayName({ ...me, name: null, given_name: null, family_name: null })).toBe('q@example.com')
expect(initials({ ...me, given_name: 'Quentin', family_name: 'Vanderlinden' })).toBe('QV')
expect(initials({ ...me, name: null, given_name: null, family_name: null })).toBe('Q') // first letter of the e-mail, upper case
```

- [ ] **Step 2: Run to see them fail** — `npx vitest run src/shell/displayName.test.ts`; Expected: FAIL.

- [ ] **Step 3: Implement `displayName.ts`, then `UserCard`** — read `node_modules/@qvanderlinden/ui/SKILL.md` first. `UserCard` fetches `api.get<Me>('/me')` once on mount; while loading or on error renders nothing (the shell must not break if `/me` fails). It shows the package's `Avatar` if exported (with `picture`, initials as fallback), else initials in a round brand-coloured span; the display name in `type-body-sm`; and a `LogOut` Lucide icon link "se déconnecter" to `signOutUrl(location.origin)`, hidden when that is `undefined` (local dev). It sits in the ink sidebar: `SidebarNav`'s footer slot if the component has one, else at the bottom of the desktop `aside` and of the mobile drawer.

- [ ] **Step 4: Run the frontend checks** — `npm run build && npm run test && npm run check:design`; Expected: pass.

- [ ] **Step 5: Look at it** — with uvicorn (`AUTH_DISABLED=true`) and `npm run dev`, screenshot the shell at 1440 and 390 px with Playwright; the card shows "Dev", no sign-out link, no overflow at 390 px.

- [ ] **Step 6: Commit** — `feat(frontend): show the signed-in user and a sign-out link`

### Task 6: Docs, smoke, and the live check

**Files:**
- Modify: `CLAUDE.md` ("What this is" one line on auth; "Local development": `AUTH_DISABLED=true` in `.env`; "End-to-end smoke": needs `AUTH_DISABLED=true`; "Deployment": the Coolify setup below)
- Modify: `frontend/scripts/smoke.mjs` only if it fails because of the new card (no change expected)

- [ ] **Step 1: Write the Deployment section** — `GOOGLE_CLIENT_ID`; no published port; the labels, `<router>` being the name Coolify generated for fisac's router:

```
traefik.http.routers.<router>.middlewares=sso@docker
traefik.http.routers.<router>-api.rule=Host(`fisac.quentinvanderlinden.dev`) && PathPrefix(`/api`)
traefik.http.routers.<router>-api.priority=100
traefik.http.routers.<router>-api.entrypoints=https
traefik.http.routers.<router>-api.tls=true
traefik.http.routers.<router>-api.tls.certresolver=letsencrypt
traefik.http.routers.<router>-api.service=<router>
traefik.http.routers.<router>-api.middlewares=sso-api@docker
```

(the entrypoint and resolver names copied from the router Coolify generated).

- [ ] **Step 2: Run the full local verification** — `uv run pytest`; `cd frontend && npm run build && npm run test && npm run check:design`; on a fresh database with `AUTH_DISABLED=true`, `npm run smoke`. Expected: all pass.

- [ ] **Step 3: Commit and push** — `docs: Google single sign-on setup`; push `claude/sso-google-auth`.

- [ ] **Step 4: Live check with the user** (after Task 2 and the deploy of this branch with the labels and `GOOGLE_CLIENT_ID`), recording each result in the PR description:
  1. `curl -si https://fisac.quentinvanderlinden.dev/` → 302 to `accounts.google.com`;
  2. `curl -si https://fisac.quentinvanderlinden.dev/api/company` → 401;
  3. signed in: the app works, the card shows the Google name and avatar;
  4. a tab left open 1 h 30 still saves (refresh works);
  5. "se déconnecter" signs out, and the next API call sends the browser to Google;
  6. the installed PWA, signed out, ends on Google's sign-in, not on an empty shell.
