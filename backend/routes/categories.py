"""Category routes."""
from fastapi import APIRouter

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
async def list_categories(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.categories.find({"family_id": current_user["family_id"]})
    out = []
    async for c in cursor:
        out.append({
            "id": str(c["_id"]),
            "family_id": c["family_id"],
            "name": c["name"],
            "name_id": c.get("name_id"),
            "kind": c["kind"],
            "icon": c.get("icon"),
            "color": c.get("color"),
            "parent_id": c.get("parent_id"),
        })
    return out
