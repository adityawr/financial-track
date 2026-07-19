"""Auth routes: register, login, me."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from bson import ObjectId

from db import get_db, seed_family_categories, seed_family_providers
from auth_utils import hash_password, verify_password, create_access_token, CurrentUser
from models import RegisterRequest, LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


def _serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user["name"],
        "avatar_url": user.get("avatar_url"),
        "role": user.get("role", "Owner"),
        "family_id": str(user["family_id"]),
        "created_at": user["created_at"],
    }


@router.post("/register")
async def register(payload: RegisterRequest):
    db = get_db()
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    now = datetime.now(timezone.utc)

    # ---- Path A: joining via invite ----
    if payload.invite_token:
        inv = await db.family_invites.find_one({"token": payload.invite_token})
        if not inv or inv["status"] != "pending":
            raise HTTPException(status_code=400, detail="Undangan tidak valid")
        expires_at = inv["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            raise HTTPException(status_code=400, detail="Undangan sudah kedaluwarsa")
        if inv["email"].lower() != email:
            raise HTTPException(status_code=400, detail="Email tidak cocok dengan undangan")

        family_id = inv["family_id"]
        role = inv["role"]
        user_doc = {
            "email": email,
            "password_hash": hash_password(payload.password),
            "name": payload.name.strip(),
            "avatar_url": None,
            "role": role,
            "created_at": now,
            "joined_at": now,
            "status": "active",
            "family_id": family_id,
        }
        user_result = await db.users.insert_one(user_doc)
        user_id = str(user_result.inserted_id)
        await db.families.update_one({"_id": ObjectId(family_id)}, {"$addToSet": {"member_ids": user_id}})
        await db.family_invites.update_one(
            {"_id": inv["_id"]},
            {"$set": {"status": "accepted", "accepted_by": user_id, "accepted_at": now}},
        )
        user = await db.users.find_one({"_id": user_result.inserted_id})
        token = create_access_token(user_id, email)
        return {"user": _serialize_user(user), "access_token": token, "token_type": "bearer"}

    # ---- Path B: creating a brand new family (Owner) ----
    family_name = (payload.family_name or f"{payload.name}'s Family").strip()
    user_doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "avatar_url": None,
        "role": "Owner",
        "created_at": now,
        "joined_at": now,
        "status": "active",
        "family_id": None,
    }
    user_result = await db.users.insert_one(user_doc)
    user_id = str(user_result.inserted_id)

    family_doc = {
        "name": family_name,
        "owner_id": user_id,
        "currency": "IDR",
        "created_at": now,
        "member_ids": [user_id],
    }
    family_result = await db.families.insert_one(family_doc)
    family_id = str(family_result.inserted_id)

    await db.users.update_one({"_id": user_result.inserted_id}, {"$set": {"family_id": family_id}})
    await seed_family_categories(family_id)
    await seed_family_providers(family_id)

    user = await db.users.find_one({"_id": user_result.inserted_id})
    token = create_access_token(user_id, email)
    return {"user": _serialize_user(user), "access_token": token, "token_type": "bearer"}


@router.post("/login")
async def login(payload: LoginRequest):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(str(user["_id"]), email)
    return {"user": _serialize_user(user), "access_token": token, "token_type": "bearer"}


@router.get("/me")
async def me(current_user: dict = CurrentUser):
    return current_user
