from types import SimpleNamespace

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
    if not _authorized_parties():
        raise RuntimeError("CLERK_AUTHORIZED_PARTIES is not set")
    try:
        load_pem_public_key(_jwt_key().encode())
    except ValueError as exc:
        raise RuntimeError("CLERK_JWT_KEY is not a PEM public key") from exc


def require_user(request: Request) -> str:
    """The Clerk user id of the request's session, or a 401.

    With `jwt_key` the verification makes no network call. The SDK only sees the
    Authorization header: it would otherwise fall back to the __session cookie, which
    a cross-site form post also carries.
    """
    authorization = request.headers.get("authorization")
    state = authenticate_request(
        SimpleNamespace(headers={} if authorization is None else {"Authorization": authorization}),
        AuthenticateRequestOptions(jwt_key=_jwt_key(), authorized_parties=_authorized_parties()),
    )
    if not state.is_signed_in:
        raise HTTPException(status_code=401, detail="Non authentifié", headers={"WWW-Authenticate": "Bearer"})
    return state.payload["sub"]
