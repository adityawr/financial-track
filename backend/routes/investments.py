"""Investments: Gold, Time Deposit, Mutual Fund.

Data model per type is kept flat inside `details` dict for flexibility.
"""
from datetime import datetime, timezone
from typing import Optional, Literal, Any
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/investments", tags=["investments"])

InvestmentType = Literal["gold", "time_deposit", "mutual_fund"]
Visibility = Literal["PRIVATE", "SHARED"]


class InvestmentCreate(BaseModel):
    type: InvestmentType
    name: str = Field(min_length=1)
    principal: float = Field(ge=0)   # for gold: cost basis; TD: pokok; MF: modal awal
    current_value: float = Field(ge=0)  # snapshot valuation
    start_date: Optional[datetime] = None
    visibility: Visibility = "PRIVATE"
    notes: Optional[str] = None
    # Type-specific fields (all optional; validated per type)
    units: Optional[float] = None            # gold (grams) / MF (units)
    unit_price: Optional[float] = None       # gold price/gr or NAV
    bank: Optional[str] = None               # TD
    interest_rate: Optional[float] = None    # TD annual %
    maturity_date: Optional[datetime] = None
    auto_rollover: Optional[bool] = None


class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    current_value: Optional[float] = None
    unit_price: Optional[float] = None
    units: Optional[float] = None
    visibility: Optional[Visibility] = None
    notes: Optional[str] = None
    interest_rate: Optional[float] = None
    maturity_date: Optional[datetime] = None
    auto_rollover: Optional[bool] = None


class PriceEntry(BaseModel):
    unit_price: float = Field(gt=0)
    units: Optional[float] = None  # if user also updates holdings
    date: Optional[datetime] = None
    note: Optional[str] = None


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _serialize(i: dict) -> dict:
    return {
        "id": str(i["_id"]),
        "family_id": i["family_id"],
        "owner_id": i["owner_id"],
        "type": i["type"],
        "name": i["name"],
        "principal": i.get("principal", 0),
        "current_value": i.get("current_value", 0),
        "gain": (i.get("current_value", 0) or 0) - (i.get("principal", 0) or 0),
        "units": i.get("units"),
        "unit_price": i.get("unit_price"),
        "bank": i.get("bank"),
        "interest_rate": i.get("interest_rate"),
        "start_date": i.get("start_date"),
        "maturity_date": i.get("maturity_date"),
        "auto_rollover": i.get("auto_rollover"),
        "visibility": i.get("visibility", "PRIVATE"),
        "notes": i.get("notes"),
        "price_history": i.get("price_history", []),
        "created_at": i["created_at"],
    }


@router.get("")
async def list_investments(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.investments.find({**_visible_filter(current_user), "status": {"$ne": "closed"}})
    return [_serialize(i) async for i in cursor.sort("created_at", -1)]


@router.post("")
async def create_investment(payload: InvestmentCreate, current_user: dict = CurrentUser):
    db = get_db()
    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "type": payload.type,
        "name": payload.name.strip(),
        "principal": payload.principal,
        "current_value": payload.current_value,
        "start_date": payload.start_date or now,
        "visibility": payload.visibility,
        "notes": payload.notes,
        "status": "active",
        "created_at": now,
        "units": payload.units,
        "unit_price": payload.unit_price,
        "bank": payload.bank,
        "interest_rate": payload.interest_rate,
        "maturity_date": payload.maturity_date,
        "auto_rollover": payload.auto_rollover,
        "price_history": [],
    }
    if payload.type == "gold" and payload.unit_price is not None:
        doc["price_history"] = [{"date": now, "unit_price": payload.unit_price, "units": payload.units}]
    result = await db.investments.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.patch("/{inv_id}")
async def update_investment(inv_id: str, payload: InvestmentUpdate, current_user: dict = CurrentUser):
    db = get_db()
    inv = await db.investments.find_one({"_id": ObjectId(inv_id)})
    if not inv or inv["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Investasi tidak ditemukan")
    if inv["visibility"] == "PRIVATE" and inv["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await db.investments.update_one({"_id": ObjectId(inv_id)}, {"$set": updates})
    inv = await db.investments.find_one({"_id": ObjectId(inv_id)})
    return _serialize(inv)


@router.post("/{inv_id}/price")
async def update_price(inv_id: str, payload: PriceEntry, current_user: dict = CurrentUser):
    """Update harga per unit (mis. harga emas harian) + hitung ulang current_value."""
    db = get_db()
    inv = await db.investments.find_one({"_id": ObjectId(inv_id)})
    if not inv or inv["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Investasi tidak ditemukan")
    if inv["visibility"] == "PRIVATE" and inv["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")

    now = payload.date or datetime.now(timezone.utc)
    units = payload.units if payload.units is not None else (inv.get("units") or 0)
    new_value = units * payload.unit_price
    entry = {"date": now, "unit_price": payload.unit_price, "units": units, "note": payload.note}
    set_ops = {"unit_price": payload.unit_price, "current_value": new_value}
    if payload.units is not None:
        set_ops["units"] = payload.units
    await db.investments.update_one(
        {"_id": ObjectId(inv_id)},
        {"$set": set_ops, "$push": {"price_history": entry}},
    )
    inv = await db.investments.find_one({"_id": ObjectId(inv_id)})
    return _serialize(inv)


@router.delete("/{inv_id}")
async def delete_investment(inv_id: str, current_user: dict = CurrentUser):
    db = get_db()
    inv = await db.investments.find_one({"_id": ObjectId(inv_id)})
    if not inv or inv["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Investasi tidak ditemukan")
    if inv["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa menghapus")
    await db.investments.update_one({"_id": ObjectId(inv_id)}, {"$set": {"status": "closed"}})
    return {"ok": True}
