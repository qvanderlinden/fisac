"""The result of a fiscal year: revenue, charges and depreciation.

Pure: the router passes the lines already signed (a credit note counts negative)
and leaves out the purchase lines a fixed asset takes over.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

_ZERO = Decimal("0.00")


@dataclass(frozen=True)
class ResultLine:
    category_id: int
    category_label: str
    piece_id: int
    reference: str
    date: date
    third_party: str | None
    amount: Decimal  # signed: net for a sale line, charge for a purchase line


@dataclass(frozen=True)
class AssetDepreciation:
    asset_id: int
    reference: str
    description: str
    amount: Decimal  # the asset's stored row for the year


@dataclass(frozen=True)
class PieceAmount:
    piece_id: int
    reference: str
    date: date
    third_party: str | None
    amount: Decimal


@dataclass(frozen=True)
class CategoryTotal:
    category_id: int
    label: str
    total: Decimal
    pieces: list[PieceAmount]


@dataclass(frozen=True)
class CategoryGroup:
    total: Decimal
    by_category: list[CategoryTotal]


@dataclass(frozen=True)
class DepreciationGroup:
    total: Decimal
    by_asset: list[AssetDepreciation]


@dataclass(frozen=True)
class Result:
    revenue: CategoryGroup
    charges: CategoryGroup
    depreciation: DepreciationGroup
    result: Decimal  # revenue - charges - depreciation


def _group(lines: list[ResultLine]) -> CategoryGroup:
    """By category (by label), each listing its pieces (a piece's lines in the category added up)."""
    categories: dict[int, tuple[str, dict[int, PieceAmount]]] = {}
    for line in lines:
        label, pieces = categories.setdefault(line.category_id, (line.category_label, {}))
        seen = pieces.get(line.piece_id)
        amount = line.amount + (seen.amount if seen else _ZERO)
        pieces[line.piece_id] = PieceAmount(line.piece_id, line.reference, line.date, line.third_party, amount)
    by_category = []
    for category_id, (label, pieces) in categories.items():
        ordered = sorted(pieces.values(), key=lambda p: (p.date, p.reference))
        by_category.append(CategoryTotal(category_id, label, sum((p.amount for p in ordered), _ZERO), ordered))
    by_category.sort(key=lambda c: (c.label, c.category_id))
    return CategoryGroup(sum((c.total for c in by_category), _ZERO), by_category)


def compute(
    sale_lines: list[ResultLine],
    purchase_lines: list[ResultLine],
    depreciation: list[AssetDepreciation],
) -> Result:
    revenue = _group(sale_lines)
    charges = _group(purchase_lines)
    assets = sorted(depreciation, key=lambda a: a.reference)
    total = sum((a.amount for a in assets), _ZERO)
    return Result(revenue, charges, DepreciationGroup(total, assets), revenue.total - charges.total - total)
