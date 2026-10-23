from pydantic import BaseModel

from fisac.models import FinancialAccountKind


class FinancialAccountRead(BaseModel):
    id: int
    code: str
    name: str
    kind: FinancialAccountKind
