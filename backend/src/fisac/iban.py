"""IBAN normalisation and checking (format, per-country length, mod 97)."""

import re

LENGTHS = {"BE": 16, "NL": 18, "LU": 20, "DE": 22, "FR": 27}
COUNTRIES = {"BE": "Belgique", "NL": "Pays-Bas", "LU": "Luxembourg", "DE": "Allemagne", "FR": "France"}
_FORMAT = re.compile(r"^[A-Z]{2}[0-9]{2}[A-Z0-9]+$")


def normalize(value: str | None) -> str | None:
    """Spaces removed, upper case; an empty value is None."""
    if value is None:
        return None
    return "".join(value.split()).upper() or None


def problem(value: str) -> str | None:
    """None when the IBAN is valid, else the message to show."""
    country = value[:2]
    message = "IBAN invalide : vérifiez les chiffres"
    if country in COUNTRIES:
        message += f" ({COUNTRIES[country]})"
    if not _FORMAT.match(value) or len(value) != LENGTHS.get(country, len(value)):
        return message
    rearranged = value[4:] + value[:4]
    number = "".join(str(int(c, 36)) for c in rearranged)
    return None if int(number) % 97 == 1 else message
