from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from database import database
from config import settings

bearer = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    try:
        payload = jwt.decode(credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid token. Please log in again.")

    user = await database.fetch_one(
        "SELECT id, email, username, full_name, avatar_url FROM users WHERE id = :id",
        {"id": user_id},
    )
    if not user:
        raise HTTPException(401, "User not found.")
    return dict(user)
