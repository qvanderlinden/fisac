# Clerk authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every fisac `/api` route requires a valid Clerk session, signed-out visitors go to Clerk's hosted sign-in page, and the live site runs this way.

**Architecture:** The backend verifies bearer tokens offline with Clerk's public key, through one dependency on a parent `/api` router. The frontend wraps the app in `ClerkProvider` and a gate, and its plain API client gets tokens from a function the gate registers. Clerk handles identity only; there are no roles.

**Tech Stack:** FastAPI, `clerk-backend-api` 7.x; React 19, `@clerk/react`; `@clerk/testing` with Playwright; Coolify.

**Spec:** `docs/superpowers/specs/2026-11-06-clerk-auth-design.md`

## Global Constraints

- No flag or environment variable turns authentication off. Tests override the dependency in-process only.
- A 401 body is `{"detail": "Non authentifié"}` with `WWW-Authenticate: Bearer`; the reason is never exposed and tokens are never logged.
- No `CLERK_SECRET_KEY` in the app or the image. It is used only by the smoke test, on a development instance.
- UI follows `@qvanderlinden/ui`: read `frontend/node_modules/@qvanderlinden/ui/SKILL.md` first. French copy, sentence case for buttons, Lucide icons, no raw colours.
- A 401 never redirects. Only the gate redirects, and only when Clerk says signed out.
- `CLERK_AUTHORIZED_PARTIES` production value: `https://fisac.quentinvanderlinden.dev`. Local: `http://localhost:5173`.
- Merging to `main` deploys to production. Never merge or push `main` without the owner saying so.

## Review Focus

1. A malformed `Authorization` header (non-ASCII, no `Bearer`, a machine-looking `mt_…` token): expect 401, never 500. Pinned in Task 1.
2. A `CLERK_JWT_KEY` pasted badly (literal `\n`, garbage): the literal form works, garbage stops startup. Pinned in Task 1.
3. A valid token with no `azp`, or for a sibling app: expect 401. Pinned in Task 1.
4. The first screen's API call after sign-in racing the token registration: no 401 on first load. Pinned in Task 4 (the smoke fails on any console error, and a 401 logs one).
5. A deep link while signed out: `/ventes` comes back to `/ventes` after sign-in. Pinned in Task 4.

---

### Task 1: Backend verification on every `/api` route

**Files:**
- Create: `backend/src/fisac/auth.py`
- Create: `backend/tests/test_auth.py`
- Modify: `backend/src/fisac/config.py`, `backend/src/fisac/main.py`, `backend/tests/conftest.py`, `pyproject.toml`, `uv.lock`, `.env.example`

**Interfaces:**
- Produces: `require_user(request: Request) -> str` (returns the Clerk user id), `check_auth_config() -> None` (raises `RuntimeError`), `settings.clerk_jwt_key: str`, `settings.clerk_authorized_parties: str`; test fixtures `client` (signed in) and `anon_client` (no override).

- [ ] **Step 1: Add the dependency**

Run: `uv add 'clerk-backend-api>=7.1'`
Expected: `pyproject.toml` and `uv.lock` updated.

- [ ] **Step 2: Add the fixtures and write the failing tests**

In `conftest.py`, `client` sets `app.dependency_overrides[require_user] = lambda: "user_test"` and removes it after the yield. `anon_client` is the same client with no override.

`test_auth.py` generates an RSA key with `cryptography`, signs tokens with `jwt.encode(..., algorithm="RS256")` (default claims `sub="user_1"`, `azp="http://localhost:5173"`, `iat`, `nbf`, `exp` one minute ahead), and uses an autouse fixture to monkeypatch `settings.clerk_jwt_key` and `settings.clerk_authorized_parties`. Tests, all against `GET /api/fiscal-years` unless stated:

| Test | Request | Expected |
|---|---|---|
| `test_no_header` | none | 401, exact body, `WWW-Authenticate: Bearer` |
| `test_garbage_token` | `Bearer nonsense` | 401 |
| `test_expired` | `exp` in the past | 401 |
| `test_other_key` | signed by a second key | 401 |
| `test_wrong_azp` | `azp="https://budget.quentinvanderlinden.dev"` | 401 |
| `test_no_azp` | `azp` removed | 401 |
| `test_cookie_only` | valid token in `Cookie: __session=…`, no header | 401 |
| `test_machine_token` | `Bearer mt_abc` | 401 |
| `test_non_ascii_header` | `Authorization: Bearer é` as bytes | 401 |
| `test_no_bearer_prefix_garbage` | `Basic abc` | 401 |
| `test_valid` | valid token | 200 |
| `test_key_with_literal_newlines` | key stored with literal `\n`, valid token | 200 |
| `test_every_api_route_refuses_anonymous` | every `APIRoute` under `/api` from `app.routes`, each method, path params replaced by `1`, no header | all 401; assert more than 50 routes were checked so it cannot pass empty |
| `test_config_empty_key_fails` / `test_config_empty_parties_fails` / `test_config_garbage_key_fails` | `check_auth_config()` | `RuntimeError` |
| `test_config_valid` | `check_auth_config()` | returns |

- [ ] **Step 3: Run them to see them fail**

Run: `uv run pytest backend/tests/test_auth.py -v`
Expected: collection error, `fisac.auth` not found.

- [ ] **Step 4: Implement `auth.py` and the settings**

`Settings` gains `clerk_jwt_key: str = ""` and `clerk_authorized_parties: str = ""`. `auth.py`: a key helper replaces literal `\n` with newlines; a parties helper splits on commas, strips, drops empties. `require_user` calls `clerk_backend_api.security.authenticate_request` with `SimpleNamespace(headers={"Authorization": value})`, or `headers={}` if absent, and `AuthenticateRequestOptions(jwt_key=..., authorized_parties=[...])`. On `is_signed_in` it returns `payload["sub"]`; otherwise it raises `HTTPException(401, "Non authentifié", headers={"WWW-Authenticate": "Bearer"})`. If a Review Focus case raises from inside the SDK, treat it as unauthenticated. `check_auth_config` rejects empty values and parses the key with `cryptography`'s `load_pem_public_key`.

- [ ] **Step 5: Implement `main.py`**

Gather every router into `api = APIRouter(prefix="/api", dependencies=[Depends(require_user)])`, then `app.include_router(api)`. Add a `lifespan` calling `check_auth_config()`. Run the check from the lifespan, not at import, so Alembic needs no Clerk settings.

- [ ] **Step 6: Add both variables to `.env.example`, then run the whole suite**

Run: `uv run pytest`
Expected: all pass, with the existing suites unchanged.

- [ ] **Step 7: Commit, including the spec**

```bash
git add backend pyproject.toml uv.lock .env.example docs/superpowers/specs/2026-11-06-clerk-auth-design.md docs/superpowers/plans/2026-11-06-clerk-auth.md
git commit -m "feat(api): require a Clerk session on every /api route"
```

### Task 2: API client sends the token

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `setTokenGetter(get: (() => Promise<string | null>) | null): void` from `api/client.ts`.

- [ ] **Step 1: Write the failing tests** with `vi.stubGlobal('fetch', ...)`, resetting the getter after each:

- `sends the bearer token from the getter`: `Authorization` is `Bearer tok`, and `Content-Type` stays on a POST.
- `sends no header without a getter, or when it returns null`.
- `a 401 throws HttpError and does not navigate`: `status === 401`.
- `a getter failure reads as the server not responding`: `messageOf(error)` starts with `Le serveur ne répond pas`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL, `setTokenGetter` is not exported.

- [ ] **Step 3: Implement it in `request`**

Await the getter before `fetch`. If it rejects, throw `new TypeError('network: token request failed')`, which `messageOf` already maps to the unreachable message.

- [ ] **Step 4: Run the tests**

Run: `npm run test`
Expected: PASS in both time zones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): API client sends the session token"
```

### Task 3: Provider, gate, account control and build

**Files:**
- Create: `frontend/src/shell/authGate.ts`, `frontend/src/shell/authGate.test.ts`, `frontend/src/shell/AuthGate.tsx`, `frontend/src/shell/AccountControl.tsx`, `frontend/src/vite-env.d.ts`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/shell/AppShell.tsx`, `frontend/package.json`, `frontend/package-lock.json`, `Dockerfile`, `.gitignore`

**Interfaces:**
- Consumes: `setTokenGetter` (Task 2).
- Produces: `gateView(isLoaded: boolean, isSignedIn: boolean | undefined, timedOut: boolean): 'loading' | 'unreachable' | 'signed-out' | 'signed-in'`; `LOAD_TIMEOUT_MS = 10_000`.

- [ ] **Step 1: Install** with `npm install @clerk/react`. Expected: no peer conflict with React 19.2.

- [ ] **Step 2: Write the failing test** in `authGate.test.ts`:

```ts
expect(gateView(false, undefined, false)).toBe('loading')
expect(gateView(false, undefined, true)).toBe('unreachable')
expect(gateView(true, false, false)).toBe('signed-out')
expect(gateView(true, true, false)).toBe('signed-in')
expect(gateView(true, true, true)).toBe('signed-in') // loading late still wins
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest run src/shell/authGate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `authGate.ts`, then the components**

- `AuthGate.tsx` uses `useAuth()` and a timeout state. It calls `setTokenGetter` **during render**, not in an effect, with a comment explaining that child effects run first: `() => getToken()` when signed in, `null` otherwise. Views: `loading` is a quiet state, `unreachable` is a `Callout` reading `Le service de connexion ne répond pas. Réessayez dans un instant.`, `signed-out` is `<RedirectToSignIn />`, `signed-in` is `children`.
- `main.tsx` wraps `<App />` in `ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}`. `vite-env.d.ts` references `vite/client`.
- `App.tsx` puts `AuthGate` outside `FiscalYearProvider`, inside `BrowserRouter`.
- `AccountControl.tsx` is passed as `footer` to both `SidebarNav` instances in `AppShell`. It shows the name or primary email, plus `IconButton`s with `INK_ICON_BUTTON`: `UserRound` labelled `Mon compte` (`clerk.redirectToUserProfile()`) and `LogOut` labelled `Se déconnecter` (`clerk.signOut()`).

- [ ] **Step 5: Update the build**

- `Dockerfile`: `RUN --mount=type=secret,id=VITE_CLERK_PUBLISHABLE_KEY,env=VITE_CLERK_PUBLISHABLE_KEY,required=true npm run build`.
- `.gitignore`: add `frontend/.env.local`.

- [ ] **Step 6: Run the frontend checks**

Run: `npm run test && npm run check:design && VITE_CLERK_PUBLISHABLE_KEY=pk_test_placeholder npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add frontend Dockerfile .gitignore
git commit -m "feat(frontend): Clerk sign-in gate and account control"
```

### Task 4: Smoke test and documentation

**Files:**
- Modify: `frontend/scripts/smoke.mjs`, `frontend/package.json`, `frontend/package-lock.json`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Install** with `npm install -D @clerk/testing @playwright/test@1.56.1` (the peer dependency, matching the pinned `playwright`).

- [ ] **Step 2: Sign the smoke in**

Call `clerkSetup()` once, reading `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Replace each `browser.newPage({ viewport })` with a page from one signed-in context, using `setupClerkTestingToken({ page })` and `clerk.signIn` with `strategy: 'password'` and `SMOKE_EMAIL` / `SMOKE_PASSWORD`. Add first, in a fresh context: a signed-out visit to `/ventes` must land on Clerk's sign-in page with a redirect back to `/ventes`, and `/api/company` without a token must answer 401. The docs show `@clerk/testing` only with `@playwright/test`; if it won't work with the plain `playwright` script, move only the sign-in setup to what it supports and note why in a comment.

- [ ] **Step 3: Update the docs**

- `CLAUDE.md`: the auth section, new variables, second build `--secret`, smoke prerequisites, the known limit from the spec, and replace "Deployment: Not configured" with the Coolify setup from the spec.
- `README.md`: the setup variables.

- [ ] **Step 4: Commit**

```bash
git add frontend CLAUDE.md README.md
git commit -m "test(frontend): smoke signs in through Clerk; docs"
```

### Task 5: Verify against the Clerk development instance

Needs the owner's development keys. Get `CLERK_SECRET_KEY` through `request_secret` with file delivery, never through chat. The publishable key and JWT public key are not secrets.

- [ ] **Step 1: Configure** `frontend/.env.local`, the local `CLERK_JWT_KEY` and `CLERK_AUTHORIZED_PARTIES=http://localhost:5173`. The owner enables email and password and creates the test user.

- [ ] **Step 2: Run the stack and the smoke** on a fresh database, with uvicorn on :8000 and `npm run dev` on :5173.

Run: `cd frontend && npm run smoke`
Expected: all checks `ok`, exit 0.

- [ ] **Step 3: Record the two spec "to verify" items that can be checked here:** how soon a signed-out session stops working, and the default token lifetime shown in the dashboard. Fix anything found, and commit.

- [ ] **Step 4: Whole-branch review.** Use `superpowers:requesting-code-review`. Fix findings.

### Task 6: Production rollout

Merging deploys, so this order is fixed. Stop for the owner at each marked step.

- [ ] **Step 1 (owner):** Create the Clerk production instance with root domain `quentinvanderlinden.dev`, add its DNS records as "DNS only" in Cloudflare, set sign-up to Invite-only (or Waitlist), and invite users.

- [ ] **Step 2: Set the Coolify variables on app `mlno13s1qoiqaloufcq1jabu`**

Use `manage_env`: `VITE_CLERK_PUBLISHABLE_KEY` (`pk_live_`, build time), `CLERK_JWT_KEY` (multiline, runtime), `CLERK_AUTHORIZED_PARTIES=https://fisac.quentinvanderlinden.dev` (runtime).

- [ ] **Step 3 (owner):** Approve the merge to `main`. Then merge.

- [ ] **Step 4: Confirm the deploy**

Check `list_deployments` shows a deployment with `is_webhook: true`. This is also the proof of deploy on push.

- [ ] **Step 5: Verify production**

Run: `curl -s -o /dev/null -w '%{http_code}' https://fisac.quentinvanderlinden.dev/api/company`
Expected: `401`.

Run the same for `/`. Expected: `200`.

The owner then signs in on the site, and we check the redirect from an installed PWA.

- [ ] **Step 6: Hand over** the list for later: session sharing and sign-out across a sibling app.
