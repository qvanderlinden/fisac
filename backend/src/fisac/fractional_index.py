"""Fractional indexing for user-controllable ordering.

A "sort_key" is a short string over a fixed, lexicographically-ordered alphabet.
Between any two neighboring keys we can always mint a new key strictly between
them, so inserting/reordering a row touches only that one row - no renumbering
of siblings, no integer gaps to run out of (à la Figma/Linear).

Keys are compared as raw bytes: the model stores them in `String(collation="C")`
columns so Postgres ORDER BY matches Python's `<` on these strings exactly.

A key is interpreted as the fraction 0.d0 d1 d2 ... in base-`len(DIGITS)`.
`key_between(a, b)` returns a key c with a < c < b, where a=None means "before
everything" (0.0) and b=None means "after everything" (1.0). Generated keys
never end in the lowest digit, so they never collide via trailing-zero aliasing.
"""

from __future__ import annotations

# ASCII-ordered so lexicographic string comparison == digit-value comparison.
DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BASE = len(DIGITS)


def _digit(key: str, i: int) -> int:
    """Digit value at position i, 0 past the end (trailing zeros)."""
    return DIGITS.index(key[i]) if i < len(key) else 0


def _midpoint(lower: str, upper: str | None) -> str:
    """A digit-string strictly between fractions `lower` and `upper`.

    `lower` is a digit-string (>= 0.0); `upper` is a digit-string, or None to
    mean 1.0 (no upper bound). Requires lower < upper.
    """
    n = 0
    while True:
        lo = _digit(lower, n)
        hi = BASE if upper is None else _digit(upper, n)
        if lo != hi:
            break
        n += 1

    mid = (lo + hi) // 2
    if mid != lo:
        return lower[:n] + DIGITS[mid]
    # lo and hi are adjacent digits: keep lo at position n (emitted explicitly,
    # since it may be a padded trailing zero not present in `lower`), then
    # recurse into the gap between lower's remaining tail and 1.0.
    return lower[:n] + DIGITS[lo] + _midpoint(lower[n + 1 :], None)


def key_between(a: str | None, b: str | None) -> str:
    """A new sort key strictly between neighbors `a` and `b`.

    Pass a=None to insert before the first item, b=None to append after the
    last, and both None for the first item in an empty collection.
    """
    if a is not None and b is not None and a >= b:
        raise ValueError(f"keys out of order: {a!r} >= {b!r}")
    lower = a if a is not None else ""
    return _midpoint(lower, b)
