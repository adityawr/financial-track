"""Family workspace + invites + member management routes."""
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId
from pydantic import BaseModel, EmailStr, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/family", tags=["family"])

INVITE_TTL_DAYS = 14
ALLOWED_INVITE_ROLES = ("Editor", "Viewer", "Child")


def _require_owner(current_user: dict, family: dict):
    if family["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the Owner can perform this action")


async def _load_family(db, family_id: str) -> dict:
    family = await db.families.find_one({"_id": ObjectId(family_id)})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    return family


# ---------- Family info ----------
@router.get("/current")
async def get_current_family(current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    member_ids = family.get("member_ids", [])
    members = []
    if member_ids:
        cursor = db.users.find({"_id": {"$in": [ObjectId(mid) for mid in member_ids]}})
        async for m in cursor:
            members.append({
                "id": str(m["_id"]),
                "name": m["name"],
                "email": m["email"],
                "avatar_url": m.get("avatar_url"),
                "role": m.get("role", "Owner"),
                "status": m.get("status", "active"),
                "joined_at": m.get("joined_at") or m.get("created_at"),
                "is_owner": str(m["_id"]) == family["owner_id"],
            })
    # sort: owner first, then by name
    members.sort(key=lambda x: (not x["is_owner"], (x["name"] or "").lower()))
    return {
        "id": str(family["_id"]),
        "name": family["name"],
        "owner_id": family["owner_id"],
        "currency": family.get("currency", "IDR"),
        "created_at": family["created_at"],
        "members": members,
    }


# ---------- Invites ----------
class InviteCreate(BaseModel):
    email: EmailStr
    role: Literal["Editor", "Viewer", "Child"] = "Editor"


def _serialize_invite(inv: dict, family_name: Optional[str] = None, inviter_name: Optional[str] = None) -> dict:
    return {
        "id": str(inv["_id"]),
        "family_id": inv["family_id"],
        "family_name": family_name,
        "email": inv["email"],
        "role": inv["role"],
        "token": inv["token"],
        "status": inv["status"],
        "invited_by": inv["invited_by"],
        "inviter_name": inviter_name,
        "expires_at": inv["expires_at"],
        "created_at": inv["created_at"],
    }


@router.post("/invites")
async def create_invite(payload: InviteCreate, current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    _require_owner(current_user, family)

    email = payload.email.lower().strip()

    # Reject if email already a member of this family
    existing_user = await db.users.find_one({"email": email})
    if existing_user and str(existing_user["_id"]) in family.get("member_ids", []):
        raise HTTPException(status_code=400, detail="Email ini sudah menjadi anggota keluarga")

    # Revoke previous pending invites for the same email in this family
    await db.family_invites.update_many(
        {"family_id": current_user["family_id"], "email": email, "status": "pending"},
        {"$set": {"status": "revoked"}},
    )

    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(24)
    doc = {
        "family_id": current_user["family_id"],
        "email": email,
        "role": payload.role,
        "token": token,
        "status": "pending",
        "invited_by": current_user["id"],
        "created_at": now,
        "expires_at": now + timedelta(days=INVITE_TTL_DAYS),
    }
    result = await db.family_invites.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize_invite(doc, family_name=family["name"], inviter_name=current_user["name"])


@router.get("/invites")
async def list_invites(current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    _require_owner(current_user, family)
    cursor = db.family_invites.find({"family_id": current_user["family_id"]}).sort("created_at", -1)
    out = []
    async for inv in cursor:
        out.append(_serialize_invite(inv, family_name=family["name"], inviter_name=current_user["name"]))
    return out


@router.delete("/invites/{invite_id}")
async def revoke_invite(invite_id: str, current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    _require_owner(current_user, family)
    inv = await db.family_invites.find_one({"_id": ObjectId(invite_id)})
    if not inv or inv["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Invite not found")
    await db.family_invites.update_one({"_id": ObjectId(invite_id)}, {"$set": {"status": "revoked"}})
    return {"ok": True}


@router.get("/invites/preview")
async def preview_invite(token: str = Query(...)):
    """Public endpoint used by the register page to show which family the user is joining."""
    db = get_db()
    inv = await db.family_invites.find_one({"token": token})
    if not inv:
        raise HTTPException(status_code=404, detail="Undangan tidak ditemukan")
    if inv["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Undangan sudah {inv['status']}")
    expires_at = inv["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Undangan sudah kedaluwarsa")

    family = await db.families.find_one({"_id": ObjectId(inv["family_id"])})
    inviter = await db.users.find_one({"_id": ObjectId(inv["invited_by"])})
    return {
        "email": inv["email"],
        "role": inv["role"],
        "family_name": family["name"] if family else None,
        "inviter_name": inviter["name"] if inviter else None,
        "expires_at": inv["expires_at"],
    }


# ---------- Members ----------
class MemberUpdate(BaseModel):
    role: Optional[Literal["Editor", "Viewer", "Child"]] = None


@router.patch("/members/{user_id}")
async def update_member(user_id: str, payload: MemberUpdate, current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    _require_owner(current_user, family)
    if user_id == family["owner_id"]:
        raise HTTPException(status_code=400, detail="Tidak bisa mengubah role Owner")
    if user_id not in family.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Anggota tidak ditemukan")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user.get("role", "Editor"),
    }


@router.delete("/members/{user_id}")
async def remove_member(user_id: str, current_user: dict = CurrentUser):
    db = get_db()
    family = await _load_family(db, current_user["family_id"])
    _require_owner(current_user, family)
    if user_id == family["owner_id"]:
        raise HTTPException(status_code=400, detail="Owner tidak bisa dihapus dari keluarga")
    if user_id not in family.get("member_ids", []):
        raise HTTPException(status_code=404, detail="Anggota tidak ditemukan")
    await db.families.update_one(
        {"_id": ObjectId(current_user["family_id"])},
        {"$pull": {"member_ids": user_id}},
    )
    # Deactivate user; do not delete auth so their history is preserved
    await db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"status": "removed", "family_id": None}},
    )
    return {"ok": True}
