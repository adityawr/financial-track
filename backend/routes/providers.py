"""Providers (bank / e-wallet / cash / credit-card catalogs) per family."""
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/providers", tags=["providers"])

ProviderType = Literal["bank", "ewallet", "cash", "credit_card"]


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1)
    type: ProviderType
    color: Optional[str] = None
    icon: Optional[str] = None


class ProviderUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[ProviderType] = None
    color: Optional[str] = None
    icon: Optional[str] = None


def _serialize(p: dict) -> dict:
    return {
        "id": str(p["_id"]),
        "family_id": p["family_id"],
        "name": p["name"],
        "type": p["type"],
        "color": p.get("color"),
        "icon": p.get("icon"),
        "is_default": p.get("is_default", False),
        "created_at": p.get("created_at"),
    }


def _require_owner_or_editor(user: dict):
    if user.get("role") not in ("Owner", "Editor"):
        raise HTTPException(status_code=403, detail="Hanya Owner/Editor yang boleh mengubah")


@router.get("")
async def list_providers(current_user: dict = CurrentUser):
    db = get_db()
    # Auto-seed for families that haven't got providers yet (e.g., created before Phase 2)
    count = await db.providers.count_documents({"family_id": current_user["family_id"]})
    if count == 0:
        from db import seed_family_providers
        await seed_family_providers(current_user["family_id"])
    cursor = db.providers.find({"family_id": current_user["family_id"]})
    return [_serialize(p) async for p in cursor.sort([("type", 1), ("name", 1)])]


@router.post("")
async def create_provider(payload: ProviderCreate, current_user: dict = CurrentUser):
    _require_owner_or_editor(current_user)
    db = get_db()
    doc = {
        "family_id": current_user["family_id"],
        "name": payload.name.strip(),
        "type": payload.type,
        "color": payload.color,
        "icon": payload.icon,
        "is_default": False,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.providers.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.patch("/{provider_id}")
async def update_provider(provider_id: str, payload: ProviderUpdate, current_user: dict = CurrentUser):
    _require_owner_or_editor(current_user)
    db = get_db()
    prov = await db.providers.find_one({"_id": ObjectId(provider_id)})
    if not prov or prov["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Provider tidak ditemukan")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await db.providers.update_one({"_id": ObjectId(provider_id)}, {"$set": updates})
    prov = await db.providers.find_one({"_id": ObjectId(provider_id)})
    return _serialize(prov)


@router.delete("/{provider_id}")
async def delete_provider(provider_id: str, current_user: dict = CurrentUser):
    _require_owner_or_editor(current_user)
    db = get_db()
    prov = await db.providers.find_one({"_id": ObjectId(provider_id)})
    if not prov or prov["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Provider tidak ditemukan")
    # Hindari menghapus jika masih dipakai account
    used = await db.accounts.count_documents({
        "family_id": current_user["family_id"],
        "provider": prov["name"],
        "status": {"$ne": "deleted"},
    })
    if used > 0:
        raise HTTPException(status_code=400, detail=f"Provider masih digunakan oleh {used} akun")
    await db.providers.delete_one({"_id": ObjectId(provider_id)})
    return {"ok": True}
