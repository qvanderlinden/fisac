import base64
import hashlib
import hmac
import json
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from fisac import auth
from fisac.config import Settings, settings
from fisac.main import app

CLAIMS = {
    "iss": "https://accounts.google.com",
    "aud": "test-client",
    "sub": "1",
    "email": "q@example.com",
    "email_verified": True,
    "name": "Quentin Vanderlinden",
    "given_name": "Quentin",
    "family_name": "Vanderlinden",
    "picture": "https://example.com/a.png",
}


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="module")
def key():
    return _key()


@pytest.fixture(scope="module")
def jwks_url(key):
    """The key's JWKS, served over HTTP on localhost (PyJWKClient only fetches http(s))."""
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key(), as_dict=True)
    body = json.dumps({"keys": [{**jwk, "kid": "test", "use": "sig", "alg": "RS256"}]}).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/certs"
    server.shutdown()


@pytest.fixture(autouse=True)
def auth_on(monkeypatch, jwks_url):
    monkeypatch.setattr(settings, "auth_disabled", False)
    monkeypatch.setattr(settings, "google_client_id", "test-client")
    monkeypatch.setattr(settings, "google_jwks_url", jwks_url)
    auth._jwks_client.cache_clear()
    yield
    auth._jwks_client.cache_clear()


@pytest.fixture
def token(key):
    def make(signing_key=None, drop=(), **overrides):
        now = int(time.time())
        claims = {**CLAIMS, "iat": now, "exp": now + 3600, **overrides}
        for name in drop:
            claims.pop(name)
        return jwt.encode(claims, signing_key or key, algorithm="RS256", headers={"kid": "test"})

    return make


def bearer(value: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {value}"}


async def test_missing_header_is_401(client):
    r = await client.get("/api/company")
    assert r.status_code == 401


async def test_foreign_key_is_401(client, token):
    r = await client.get("/api/company", headers=bearer(token(signing_key=_key())))
    assert r.status_code == 401


async def test_wrong_audience_is_401(client, token):
    r = await client.get("/api/company", headers=bearer(token(aud="other-client")))
    assert r.status_code == 401


async def test_wrong_issuer_is_401(client, token):
    r = await client.get("/api/company", headers=bearer(token(iss="https://evil.example")))
    assert r.status_code == 401


async def test_expired_token_is_401(client, token):
    r = await client.get("/api/company", headers=bearer(token(exp=int(time.time()) - 60)))
    assert r.status_code == 401


async def test_unverified_email_is_401(client, token):
    r = await client.get("/api/company", headers=bearer(token(email_verified=False)))
    assert r.status_code == 401


async def test_unsigned_or_hs256_token_is_refused(client, key):
    claims = {**CLAIMS, "exp": int(time.time()) + 3600}
    unsigned = jwt.encode(claims, None, algorithm="none", headers={"kid": "test"})
    pem = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    # Forged by hand: PyJWT refuses to sign HS256 with a PEM key.
    def b64(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    head = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": "test"}).encode())
    body = b64(json.dumps(claims).encode())
    sig = b64(hmac.new(pem, f"{head}.{body}".encode(), hashlib.sha256).digest())
    for value in (unsigned, f"{head}.{body}.{sig}", "not-a-jwt"):
        r = await client.get("/api/company", headers=bearer(value))
        assert r.status_code == 401, value


async def test_unreachable_jwks_is_401(client, token, monkeypatch):
    # Nothing listens on port 9 of localhost.
    monkeypatch.setattr(settings, "google_jwks_url", "http://127.0.0.1:9/certs")
    auth._jwks_client.cache_clear()
    r = await client.get("/api/company", headers=bearer(token()))
    assert r.status_code == 401


async def test_valid_token_reaches_a_route(client, token):
    r = await client.get("/api/company", headers=bearer(token()))
    assert r.status_code == 200


async def test_issuer_without_scheme_is_accepted(client, token):
    r = await client.get("/api/company", headers=bearer(token(iss="accounts.google.com")))
    assert r.status_code == 200


async def test_me_returns_the_claims(client, token):
    r = await client.get("/api/me", headers=bearer(token()))
    assert r.status_code == 200
    assert r.json() == {
        "email": "q@example.com",
        "name": "Quentin Vanderlinden",
        "given_name": "Quentin",
        "family_name": "Vanderlinden",
        "picture": "https://example.com/a.png",
    }


async def test_me_missing_names_are_null(client, token):
    value = token(drop=("name", "given_name", "family_name", "picture"))
    r = await client.get("/api/me", headers=bearer(value))
    assert r.json() == {
        "email": "q@example.com",
        "name": None,
        "given_name": None,
        "family_name": None,
        "picture": None,
    }


async def test_disabled_returns_dev_user(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_disabled", True)
    r = await client.get("/api/me")
    assert r.status_code == 200
    assert r.json() == auth.DEV_USER.model_dump()


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


def test_check_settings_refuses_empty_client_id():
    with pytest.raises(RuntimeError):
        auth.check_settings(Settings(auth_disabled=False, google_client_id=""))
    auth.check_settings(Settings(auth_disabled=True, google_client_id=""))
    auth.check_settings(Settings(auth_disabled=False, google_client_id="id"))
