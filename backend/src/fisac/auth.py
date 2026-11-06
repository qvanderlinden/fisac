from types import SimpleNamespace
from urllib.parse import urlsplit

from clerk_backend_api.security import authenticate_request
from clerk_backend_api.security.types import AuthenticateRequestOptions
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi import HTTPException, Request

from fisac.config import settings


def _jwt_key() -> str:
    # An environment variable often holds the PEM on one line, with literal \n.
    return settings.clerk_jwt_key.replace("\\n", "\n")


def _authorized_parties() -> list[str]:
    return [p.strip() for p in settings.clerk_authorized_parties.split(",") if p.strip()]


def check_auth_config() -> None:
    """Refuse to serve without Clerk's settings, rather than answer 401 to everyone."""
    parties = _authorized_parties()
    if not parties:
        raise RuntimeError("CLERK_AUTHORIZED_PARTIES is not set")
    for party in parties:
        # A token's azp is a bare origin: anything else here would refuse every session.
        url = urlsplit(party)
        if url.scheme not in ("http", "https") or not url.netloc or party != f"{url.scheme}://{url.netloc}":
            raise RuntimeError(f"CLERK_AUTHORIZED_PARTIES has {party!r}, not an origin like https://host")
    try:
        load_pem_public_key(_jwt_key().encode())
    except ValueError as exc:
        raise RuntimeError("CLERK_JWT_KEY is not a PEM public key") from exc


def require_user(request: Request) -> str:
    """The Clerk user id of the request's session, or a 401.

    With `jwt_key` and session tokens only, the verification makes no network call: the
    SDK would otherwise send machine-looking tokens to Clerk. It only sees the
    Authorization header: it would otherwise fall back to the __session cookie, which a
    cross-site form post also carries.
    """
    authorization = request.headers.get("authorization")
    state = authenticate_request(
        SimpleNamespace(headers={} if authorization is None else {"Authorization": authorization}),
        AuthenticateRequestOptions(
            jwt_key=_jwt_key(), authorized_parties=_authorized_parties(), accepts_token=["session_token"]
        ),
    )
    if not state.is_signed_in:
        raise HTTPException(status_code=401, detail="Non authentifié", headers={"WWW-Authenticate": "Bearer"})
    return state.payload["sub"]
