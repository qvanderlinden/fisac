"""Who is calling: the Google ID token oauth2-proxy passes on, verified.

oauth2-proxy (the shared sign-in service in front of every
*.quentinvanderlinden.dev app) applies the allow list and adds
`Authorization: Bearer <id_token>` to each request it lets through. A token
whose audience is our OAuth client can only come from it, so verifying the
token is enough; it also refuses a request that reached the app without
going through the proxy.
"""

from functools import cache

import jwt
from fastapi import Header
from pydantic import BaseModel, ConfigDict

from fisac.config import Settings, settings
from fisac.errors import ApiError

# Google signs with either form of its issuer.
ISSUERS = ("https://accounts.google.com", "accounts.google.com")


class User(BaseModel):
    model_config = ConfigDict(frozen=True)

    email: str
    name: str | None = None
    given_name: str | None = None
    family_name: str | None = None
    picture: str | None = None


DEV_USER = User(email="dev@localhost", name="Dev", given_name="Dev")


@cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    # Keeps the keys and fetches them again when a token names an unknown kid.
    # A short timeout: requests wait on the fetch behind the client's lock.
    return jwt.PyJWKClient(url, timeout=5)


def check_settings(s: Settings) -> None:
    if not s.auth_disabled and not s.google_client_id:
        raise RuntimeError("GOOGLE_CLIENT_ID est requis quand l'authentification est active")


def current_user(authorization: str | None = Header(default=None)) -> User:
    """The signed-in user; a 401 without a valid token.

    A plain def: FastAPI runs it in its threadpool, where the JWKS client's
    blocking fetch is harmless.
    """
    if settings.auth_disabled:
        return DEV_USER
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Authentification requise")
    try:
        key = _jwks_client(settings.google_jwks_url).get_signing_key_from_jwt(token)
    # Google's keys out of reach (or a page that is not JSON in their place):
    # a 503, not a 401, which would send the browser to sign in again for
    # nothing, round and round.
    except (jwt.PyJWKClientConnectionError, ValueError) as exc:
        raise ApiError(503, "Les clés de Google sont injoignables, réessayez dans un instant") from exc
    except jwt.PyJWTError as exc:
        raise ApiError(401, "Session invalide ou expirée") from exc
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            leeway=30,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.PyJWTError as exc:
        raise ApiError(401, "Session invalide ou expirée") from exc
    if claims.get("iss") not in ISSUERS or claims.get("email_verified") is not True:
        raise ApiError(401, "Session invalide ou expirée")
    return User(
        email=claims["email"],
        name=claims.get("name"),
        given_name=claims.get("given_name"),
        family_name=claims.get("family_name"),
        picture=claims.get("picture"),
    )
