from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ResultPieceRead(BaseModel):
    piece_id: int
    reference: str
    date: date
    third_party: str | None
    amount: Decimal


class ResultCategoryRead(BaseModel):
    category_id: int
    label: str
    total: Decimal
    pieces: list[ResultPieceRead]


class ResultGroupRead(BaseModel):
    total: Decimal
    by_category: list[ResultCategoryRead]


class ResultAssetRead(BaseModel):
    asset_id: int
    reference: str
    description: str
    amount: Decimal


class ResultDepreciationRead(BaseModel):
    total: Decimal
    by_asset: list[ResultAssetRead]


class ResultRead(BaseModel):
    revenue: ResultGroupRead
    charges: ResultGroupRead
    depreciation: ResultDepreciationRead
    result: Decimal
