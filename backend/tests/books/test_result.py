from datetime import date
from decimal import Decimal

from fisac.books.result import AssetDepreciation, ResultLine, compute

D = Decimal


def line(cat, label, piece, amount, day=1, third_party=None):
    return ResultLine(cat, label, piece, f"R-{piece}", date(2026, 1, day), third_party, D(amount))


def test_empty():
    r = compute([], [], [])
    assert (r.revenue.total, r.charges.total, r.depreciation.total, r.result) == (D("0.00"),) * 4
    assert r.revenue.by_category == [] and r.depreciation.by_asset == []


def test_three_rules():
    sales = [line(1, "Ventes", 1, "1000.00"), line(1, "Ventes", 2, "-100.00", 5)]
    charges = [line(7, "Restaurant", 3, "112.00"), line(8, "Fournitures", 4, "50.00")]
    assets = [AssetDepreciation(1, "I-001", "Portable", D("500.00"))]
    r = compute(sales, charges, assets)
    assert r.revenue.total == D("900.00") and r.charges.total == D("162.00")
    assert r.depreciation.total == D("500.00") and r.result == D("238.00")
    assert [c.label for c in r.charges.by_category] == ["Fournitures", "Restaurant"]
    assert [p.reference for p in r.revenue.by_category[0].pieces] == ["R-1", "R-2"]


def test_lines_of_one_piece_in_a_category_are_one_entry():
    r = compute([line(1, "Ventes", 1, "10.00"), line(1, "Ventes", 1, "5.00")], [], [])
    (category,) = r.revenue.by_category
    assert category.total == D("15.00") and len(category.pieces) == 1


def test_loss():
    r = compute([], [line(7, "Restaurant", 3, "10.00")], [AssetDepreciation(1, "I-001", "", D("5.00"))])
    assert r.result == D("-15.00")
