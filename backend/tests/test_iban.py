import pytest

from fisac import iban


@pytest.mark.parametrize(
    "value",
    [
        "NL91ABNA0417164300",
        "BE68539007547034",
        "DE89370400440532013000",
        "FR1420041010050500013M02606",
        "LU280019400644750000",
    ],
)
def test_specimens_are_valid(value):
    assert iban.problem(value) is None


def test_wrong_digit():
    assert iban.problem("BE68539007547035") == "IBAN invalide : vérifiez les chiffres (Belgique)"


def test_wrong_length():
    assert iban.problem("BE6853900754703") == "IBAN invalide : vérifiez les chiffres (Belgique)"


def test_normalize():
    assert iban.normalize(" be68 5390 0754 7034 ") == "BE68539007547034"
    assert iban.normalize("  ") is None


def test_too_long_is_rejected_even_for_an_unknown_country():
    assert iban.problem("XX00" + "1" * 31) == "IBAN invalide : vérifiez les chiffres"
    assert iban.problem("BE68" + "5" * 31) == "IBAN invalide : vérifiez les chiffres (Belgique)"
