"""Family workspace routes."""
from fastapi import APIRouter, HTTPException
from bson import ObjectId

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/family", tags=["family"])


@router.get("/current")
async def get_current_family(current_user: dict = CurrentUser):
    db = get_db()
    family = await db.families.find_one({"_id": ObjectId(current_user["family_id"])})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
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
            })
    return {
        "id": str(family["_id"]),
        "name": family["name"],
        "owner_id": family["owner_id"],
        "currency": family.get("currency", "IDR"),
        "created_at": family["created_at"],
        "members": members,
    }
