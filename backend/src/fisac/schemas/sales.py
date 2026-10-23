from fisac.schemas.pieces import (
    LineCreate,
    LineRead,
    LineUpdate,
    PieceCreate,
    PieceRead,
    PieceUpdate,
)

SaleCreate = PieceCreate
SaleUpdate = PieceUpdate
SaleLineCreate = LineCreate
SaleLineUpdate = LineUpdate
SaleLineRead = LineRead


class SaleRead(PieceRead):
    lines: list[SaleLineRead]
