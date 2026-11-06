import re
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from fisac.auth import check_auth_config
from fisac.config import settings
from fisac.main import app

ORIGIN = "http://localhost:5173"
PATH = "/api/fiscal-years"


def _keypair() -> tuple[rsa.RSAPrivateKey, str]:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return private, public.decode()


PRIVATE, PUBLIC = _keypair()
OTHER_PRIVATE, _ = _keypair()


def _token(key=PRIVATE, drop: tuple[str, ...] = (), **claims) -> str:
    now = int(time.time())
    values = {"sub": "user_1", "azp": ORIGIN, "iat": now, "nbf": now, "exp": now + 60, **claims}
    for name in drop:
        del values[name]
    return jwt.encode(values, key, algorithm="RS256")


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def clerk_settings(monkeypatch):
    monkeypatch.setattr(settings, "clerk_jwt_key", PUBLIC)
    monkeypatch.setattr(settings, "clerk_authorized_parties", ORIGIN)


async def test_no_header(anon_client):
    response = await anon_client.get(PATH)
    assert response.status_code == 401
    assert response.json() == {"detail": "Non authentifié"}
    assert response.headers["www-authenticate"] == "Bearer"


async def test_valid(anon_client):
    assert (await anon_client.get(PATH, headers=_bearer(_token()))).status_code == 200


async def test_several_authorized_parties(anon_client, monkeypatch):
    monkeypatch.setattr(settings, "clerk_authorized_parties", f"https://other.test , {ORIGIN}")
    assert (await anon_client.get(PATH, headers=_bearer(_token()))).status_code == 200


async def test_key_with_literal_newlines(anon_client, monkeypatch):
    monkeypatch.setattr(settings, "clerk_jwt_key", PUBLIC.replace("\n", "\\n"))
    assert (await anon_client.get(PATH, headers=_bearer(_token()))).status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param(_bearer("nonsense"), id="garbage"),
        pytest.param(_bearer(_token(exp=int(time.time()) - 120)), id="expired"),
        pytest.param(_bearer(_token(key=OTHER_PRIVATE)), id="other-key"),
        pytest.param(_bearer(_token(azp="https://budget.quentinvanderlinden.dev")), id="sibling-app"),
        pytest.param(_bearer(_token(drop=("azp",))), id="no-azp"),
        pytest.param(_bearer("mt_abc"), id="machine-token"),
        pytest.param({"Authorization": "Basic abc"}, id="basic"),
        pytest.param({"Authorization": "Bearer é".encode("latin-1")}, id="non-ascii"),
        pytest.param({"Cookie": f"__session={_token()}"}, id="cookie-only"),
    ],
)
async def test_refused(anon_client, headers):
    response = await anon_client.get(PATH, headers=headers)
    assert response.status_code == 401
    assert response.json() == {"detail": "Non authentifié"}


async def test_every_api_route_refuses_anonymous(anon_client):
    # From the OpenAPI schema: app.routes doesn't flatten included routers.
    checked = 0
    for route, operations in app.openapi()["paths"].items():
        path = re.sub(r"\{[^}]+\}", "1", route)
        for method in operations:
            response = await anon_client.request(method, path)
            assert response.status_code == 401, f"{method} {route}"
            checked += 1
    assert checked > 50


def test_config_valid():
    check_auth_config()


def test_config_empty_key_fails(monkeypatch):
    monkeypatch.setattr(settings, "clerk_jwt_key", "")
    with pytest.raises(RuntimeError, match="CLERK_JWT_KEY"):
        check_auth_config()


def test_config_garbage_key_fails(monkeypatch):
    monkeypatch.setattr(settings, "clerk_jwt_key", "not a key")
    with pytest.raises(RuntimeError, match="CLERK_JWT_KEY"):
        check_auth_config()


def test_config_empty_parties_fails(monkeypatch):
    monkeypatch.setattr(settings, "clerk_authorized_parties", " , ")
    with pytest.raises(RuntimeError, match="CLERK_AUTHORIZED_PARTIES"):
        check_auth_config()
