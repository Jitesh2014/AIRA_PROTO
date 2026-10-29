from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_current_user
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    register_user,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest) -> AuthResponse:
    try:
        register_user(body.email, body.password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    token = create_access_token(body.email.lower())
    return AuthResponse(access_token=token, email=body.email.lower())


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> AuthResponse:
    email = authenticate_user(body.email, body.password)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(email)
    return AuthResponse(access_token=token, email=email)


@router.get("/me", response_model=UserResponse)
def me(email: str = Depends(get_current_user)) -> UserResponse:
    return UserResponse(email=email)
