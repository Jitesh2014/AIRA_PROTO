import sqlite3
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings
from app.database import get_connection

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": email, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        email = payload.get("sub")
        return email if isinstance(email, str) else None
    except JWTError:
        return None


def register_user(email: str, password: str) -> None:
    password_hash = hash_password(password)
    with get_connection() as conn:
        try:
            conn.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (email.lower(), password_hash),
            )
            conn.commit()
        except sqlite3.IntegrityError as exc:
            raise ValueError("Email already registered") from exc


def authenticate_user(email: str, password: str) -> str | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT email, password_hash FROM users WHERE email = ?",
            (email.lower(),),
        ).fetchone()

    if not row:
        return None
    if not verify_password(password, row["password_hash"]):
        return None
    return row["email"]
