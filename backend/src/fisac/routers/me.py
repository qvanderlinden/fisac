from fastapi import APIRouter, Depends

from fisac.auth import User, current_user

router = APIRouter()


@router.get("/me", response_model=User)
def read_me(user: User = Depends(current_user)) -> User:
    return user
