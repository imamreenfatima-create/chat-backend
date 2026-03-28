from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from jose import jwt
import bcrypt
from database import database
from config import settings
from dependencies import get_current_user

router = APIRouter()

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    full_name: str
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

@router.post("/register")
async def register(body: RegisterRequest):
    existing = await database.fetch_one(
        "SELECT id FROM users WHERE email = :email OR username = :username",
        {"email": body.email, "username": body.username},
    )
    if existing:
        raise HTTPException(400, "Email or username already taken!")
    hashed = hash_password(body.password)
    row = await database.fetch_one(
        "INSERT INTO users (email, username, full_name, password_hash) VALUES (:email, :username, :full_name, :password_hash) RETURNING id, email, username, full_name, avatar_url",
        {"email": body.email, "username": body.username, "full_name": body.full_name, "password_hash": hashed},
    )
    return {"access_token": create_token(str(row["id"])), "user": dict(row)}

@router.post("/login")
async def login(body: LoginRequest):
    row = await database.fetch_one(
        "SELECT id, email, username, full_name, avatar_url, password_hash FROM users WHERE email = :email",
        {"email": body.email},
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "Wrong email or password!")
    user = {k: v for k, v in dict(row).items() if k != "password_hash"}
    return {"access_token": create_token(str(row["id"])), "user": user}

@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    return current_user

# NEW: Get all users (for Add Member feature)
@router.get("/all-users")
async def all_users(current_user=Depends(get_current_user)):
    rows = await database.fetch_all(
        "SELECT id, username, full_name, avatar_url, is_online FROM users ORDER BY full_name"
    )
    return [dict(r) for r in rows]
