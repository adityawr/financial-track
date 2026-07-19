"""Assets: House, Land, Vehicle, Gold, Cash, Deposits, Mutual Funds, Other.

Investment-shaped items (Gold/TD/MF) live in /api/investments.
This module focuses on non-financial-instrument wealth.
"""
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/assets", tags=["assets"])

AssetCategory = Literal["house", "land", "vehicle", "gold", "other"]
ValuationMethod = Literal["manual", "market", "appreciation", "depreciation"]
Visibility = Literal["PRIVATE", "SHARED"]


class AssetCreate(BaseModel):
    name: str = Field(min_length=1)
    category: AssetCategory
    purchase_value: float = Field(ge=0)
    current_value: float = Field(ge=0)
    purchase_date: Optional[datetime] = None
    valuation_method: ValuationMethod = "manual"
    rate_per_year: Optional[float] = None  # e.g. 5 => 5%/yr apprec / -8 => -8%/yr depre
    visibility: Visibility = "PRIVATE"
    notes: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[AssetCategory] = None
    current_value: Optional[float] = None
    valuation_method: Optional[ValuationMethod] = None
    rate_per_year: Optional[float] = None
    visibility: Optional[Visibility] = None
    notes: Optional[str] = None


class ValuationEntry(BaseModel):
    value: float = Field(ge=0)
    note: Optional[str] = None
    date: Optional[datetime] = None


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _serialize(a: dict) -> dict:
    return {
        "id": str(a["_id"]),
        "family_id": a["family_id"],
        "owner_id": a["owner_id"],
        "name": a["name"],
        "category": a["category"],
        "purchase_value": a.get("purchase_value", 0),
        "current_value": a.get("current_value", 0),
        "purchase_date": a.get("purchase_date"),
        "valuation_method": a.get("valuation_method", "manual"),
        "rate_per_year": a.get("rate_per_year"),
        "visibility": a.get("visibility", "PRIVATE"),
        "notes": a.get("notes"),
        "valuation_history": a.get("valuation_history", []),
        "created_at": a["created_at"],
    }


@router.get("")
async def list_assets(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.assets.find({**_visible_filter(current_user), "status": {"$ne": "deleted"}})
    return [_serialize(a) async for a in cursor.sort("created_at", -1)]


@router.post("")
async def create_asset(payload: AssetCreate, current_user: dict = CurrentUser):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "name": payload.name.strip(),
        "category": payload.category,
        "purchase_value": payload.purchase_value,
        "current_value": payload.current_value,
        "purchase_date": payload.purchase_date or now,
        "valuation_method": payload.valuation_method,
        "rate_per_year": payload.rate_per_year,
        "visibility": payload.visibility,
        "notes": payload.notes,
        "status": "active",
        "created_at": now,
        "valuation_history": [{
            "date": now, "value": payload.current_value, "note": "Initial valuation",
        }],
    }
    result = await db.assets.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.patch("/{asset_id}")
async def update_asset(asset_id: str, payload: AssetUpdate, current_user: dict = CurrentUser):
    db = get_db()
    a = await db.assets.find_one({"_id": ObjectId(asset_id)})
    if not a or a["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Asset tidak ditemukan")
    if a["visibility"] == "PRIVATE" and a["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await db.assets.update_one({"_id": ObjectId(asset_id)}, {"$set": updates})
    a = await db.assets.find_one({"_id": ObjectId(asset_id)})
    return _serialize(a)


@router.post("/{asset_id}/valuation")
async def add_valuation(asset_id: str, payload: ValuationEntry, current_user: dict = CurrentUser):
    db = get_db()
    a = await db.assets.find_one({"_id": ObjectId(asset_id)})
    if not a or a["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Asset tidak ditemukan")
    if a["visibility"] == "PRIVATE" and a["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    entry = {
        "date": payload.date or datetime.now(timezone.utc),
        "value": payload.value,
        "note": payload.note,
    }
    await db.assets.update_one(
        {"_id": ObjectId(asset_id)},
        {"$set": {"current_value": payload.value}, "$push": {"valuation_history": entry}},
    )
    a = await db.assets.find_one({"_id": ObjectId(asset_id)})
    return _serialize(a)


@router.delete("/{asset_id}")
async def delete_asset(asset_id: str, current_user: dict = CurrentUser):
    db = get_db()
    a = await db.assets.find_one({"_id": ObjectId(asset_id)})
    if not a or a["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Asset tidak ditemukan")
    if a["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Hanya pemilik asset yang bisa menghapus")
    await db.assets.update_one({"_id": ObjectId(asset_id)}, {"$set": {"status": "deleted"}})
    return {"ok": True}
