"""Who is calling and whether they may: the shared qv-auth module.

The shared sign-in service in front of every *.quentinvanderlinden.dev app
adds `Authorization: Bearer <id_token>` to each request it lets through.
qv-auth verifies the token, keeps the `users` table and gates access
(pending, approved, rejected); the administrators come from AUTH_ADMIN_EMAILS.
"""

from qv_auth import Issuer, QvAuth

from fisac.config import Settings, settings
from fisac.db import get_session
from fisac.models import User


def build_auth(s: Settings) -> QvAuth:
    issuers = [Issuer(s.auth_issuer, s.auth_audience)] if s.auth_issuer else []
    return QvAuth(
        issuers=issuers,
        admin_emails=s.auth_admin_emails.split(","),
        user_model=User,
        get_session=get_session,
        disabled=s.auth_disabled,
    )


auth = build_auth(settings)
