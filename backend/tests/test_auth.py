import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from qv_auth import Issuer, TokenVerifier
from sqlalchemy import select

from fisac.auth import auth, build_auth
from fisac.config import Settings
from fisac.main import app
from fisac.models import User


class FakeIssuer:
    def __init__(self, url: str, key: rsa.RSAPrivateKey) -> None:
        self.url = url
        self.key = key

    def token(self, **overrides) -> str:
        claims = {
            "iss": self.url,
            "aud": "oauth2-proxy",
            "email": "q@example.com",
            "email_verified": True,
            "name": "Quentin Vanderlinden",
            "exp": int(time.time()) + 3600,
            **overrides,
        }
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test"})


@pytest.fixture(scope="module")
def issuer():
    """A local OIDC issuer (PyJWKClient only fetches http(s) URLs)."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    keys = json.dumps({"keys": [{**jwk, "kid": "test", "use": "sig", "alg": "RS256"}]}).encode()
    url = ""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/.well-known/openid-configuration":
                body = json.dumps({"issuer": url, "jwks_uri": url + "/keys"}).encode()
            else:
                body = keys
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    url = f"http://127.0.0.1:{server.server_port}"
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield FakeIssuer(url, key)
    server.shutdown()


@pytest.fixture(autouse=True)
def auth_on(monkeypatch, issuer):
    """Turn authentication on for the app's own `auth`, trusting the fake issuer."""
    issuers = [Issuer(issuer.url, audience="oauth2-proxy")]
    monkeypatch.setattr(auth, "disabled", False)
    monkeypatch.setattr(auth, "issuers", issuers)
    monkeypatch.setattr(auth, "admin_emails", frozenset({"admin@example.com"}))
    monkeypatch.setattr(auth, "_verifier", TokenVerifier(issuers))


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


async def test_every_api_route_requires_auth(client):
    # Behaviour, not wiring: every operation of the schema, called without a
    # token, is refused, so a router mounted later without the dependency fails.
    operations = [
        (method, re.sub(r"\{[^}]+\}", "1", path))
        for path, item in app.openapi()["paths"].items()
        for method in item
    ]
    assert len(operations) > 20
    allowed = []
    for method, path in operations:
        r = await client.request(method.upper(), path)
        if r.status_code != 401:
            allowed.append((method, path, r.status_code))
    assert allowed == []


async def test_pending_user_gets_403_pending(client, issuer):
    r = await client.get("/api/company", headers=bearer(issuer.token()))
    assert r.status_code == 403
    assert r.json() == {"detail": "Accès en attente de validation", "code": "pending"}


async def test_approved_user_passes(client, issuer, session):
    session.add(User(email="q@example.com", status="approved"))
    await session.commit()
    r = await client.get("/api/company", headers=bearer(issuer.token()))
    assert r.status_code == 200


async def test_admin_email_is_approved_on_first_call(client, issuer, session):
    r = await client.get("/api/company", headers=bearer(issuer.token(email="admin@example.com")))
    assert r.status_code == 200
    user = await session.scalar(select(User).where(User.email == "admin@example.com"))
    assert (user.status, user.is_admin) == ("approved", True)


async def test_me_is_mounted_under_auth(client, issuer):
    r = await client.get("/api/auth/me", headers=bearer(issuer.token()))
    assert r.status_code == 200
    assert r.json()["status"] == "pending"
    assert (await client.get("/api/me", headers=bearer(issuer.token()))).status_code == 404


def test_admin_emails_setting_is_split():
    built = build_auth(Settings(auth_issuer="https://id.example", auth_admin_emails=" A@x.com, b@y.com ,"))
    assert built.admin_emails == {"a@x.com", "b@y.com"}


def test_startup_refuses_empty_admin_emails():
    with pytest.raises(RuntimeError):
        build_auth(Settings(auth_disabled=False, auth_issuer="https://id.example", auth_admin_emails="")).check()
    build_auth(Settings(auth_disabled=True, auth_admin_emails="")).check()
    build_auth(Settings(auth_disabled=False, auth_issuer="https://id.example", auth_admin_emails="a@x.com")).check()
