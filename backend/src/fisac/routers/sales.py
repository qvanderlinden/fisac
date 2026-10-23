from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from fisac import pieces
from fisac.db import get_session
from fisac.models import Sale
from fisac.schemas.sales import (
    SaleCreate,
    SaleLineCreate,
    SaleLineUpdate,
    SaleRead,
    SaleUpdate,
)

router = APIRouter(tags=["sales"])

_SPEC = pieces.SALES


@router.get("/fiscal-years/{year_id}/sales", response_model=list[SaleRead])
async def list_sales(year_id: int, session: AsyncSession = Depends(get_session)):
    return await pieces.read_pieces(session, _SPEC, Sale.fiscal_year_id == year_id)


@router.post("/sales", response_model=SaleRead, status_code=201)
async def create_sale(body: SaleCreate, session: AsyncSession = Depends(get_session)):
    return await pieces.create_piece(session, _SPEC, body)


@router.get("/sales/{sale_id}", response_model=SaleRead)
async def read_sale(sale_id: int, session: AsyncSession = Depends(get_session)):
    return await pieces.read_piece(session, _SPEC, sale_id)


@router.patch("/sales/{sale_id}", response_model=SaleRead)
async def update_sale(
    sale_id: int, body: SaleUpdate, session: AsyncSession = Depends(get_session)
):
    return await pieces.update_piece(session, _SPEC, sale_id, body)


@router.delete("/sales/{sale_id}", status_code=204)
async def delete_sale(sale_id: int, session: AsyncSession = Depends(get_session)):
    await pieces.delete_piece(session, _SPEC, sale_id)
    return Response(status_code=204)


@router.post("/sales/{sale_id}/lines", response_model=SaleRead, status_code=201)
async def add_line(
    sale_id: int, body: SaleLineCreate, session: AsyncSession = Depends(get_session)
):
    return await pieces.add_line(session, _SPEC, sale_id, body)


@router.patch("/sale-lines/{line_id}", response_model=SaleRead)
async def update_line(
    line_id: int, body: SaleLineUpdate, session: AsyncSession = Depends(get_session)
):
    return await pieces.update_line(session, _SPEC, line_id, body)


@router.delete("/sale-lines/{line_id}", response_model=SaleRead)
async def delete_line(line_id: int, session: AsyncSession = Depends(get_session)):
    return await pieces.delete_line(session, _SPEC, line_id)
