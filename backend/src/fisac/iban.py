"""IBAN normalisation and checking (format, per-country length, mod 97)."""

import re

LENGTHS = {"BE": 16, "NL": 18, "LU": 20, "DE": 22, "FR": 27}
COUNTRIES = {"BE": "Belgique", "NL": "Pays-Bas", "LU": "Luxembourg", "DE": "Allemagne", "FR": "France"}
MAX_LENGTH = 34
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
    # 34 is the longest IBAN, and the width of the stored column.
    if len(value) > MAX_LENGTH or not _FORMAT.match(value):
        return message
    if len(value) != LENGTHS.get(country, len(value)):
        return message
    rearranged = value[4:] + value[:4]
    number = "".join(str(int(c, 36)) for c in rearranged)
    return None if int(number) % 97 == 1 else message


def checked(value: str | None) -> str | None:
    """Pydantic field validator body: normalised, or ValueError with the message."""
    value = normalize(value)
    if value is not None and (message := problem(value)):
        raise ValueError(message)
    return value
