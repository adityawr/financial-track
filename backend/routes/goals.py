"""Saving Goals: Emergency / House / Education / Vacation / Umrah / Retirement."""
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/goals", tags=["goals"])

GoalCategory = Literal["emergency", "house", "education", "vacation", "umrah", "retirement", "other"]
Priority = Literal["low", "medium", "high"]
Visibility = Literal["PRIVATE", "SHARED"]


class GoalCreate(BaseModel):
    name: str = Field(min_length=1)
    category: GoalCategory = "other"
    target_amount: float = Field(gt=0)
    deadline: Optional[datetime] = None
    priority: Priority = "medium"
    visibility: Visibility = "SHARED"
    notes: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    deadline: Optional[datetime] = None
    priority: Optional[Priority] = None
    visibility: Optional[Visibility] = None
    notes: Optional[str] = None


class ContributionRequest(BaseModel):
    amount: float = Field(gt=0)
    date: Optional[datetime] = None
    note: Optional[str] = None
    account_id: Optional[str] = None  # jika diisi → create expense transaction (transfer to goal)


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _serialize(g: dict) -> dict:
    current = g.get("current_amount", 0) or 0
    target = g.get("target_amount", 0) or 0
    progress = min(100, round((current / target) * 100, 2)) if target > 0 else 0
    return {
        "id": str(g["_id"]),
        "family_id": g["family_id"],
        "owner_id": g["owner_id"],
        "name": g["name"],
        "category": g.get("category", "other"),
        "target_amount": target,
        "current_amount": current,
        "progress": progress,
        "deadline": g.get("deadline"),
        "priority": g.get("priority", "medium"),
        "visibility": g.get("visibility", "SHARED"),
        "notes": g.get("notes"),
        "icon": g.get("icon"),
        "color": g.get("color"),
        "contributions": g.get("contributions", []),
        "created_at": g["created_at"],
    }


@router.get("")
async def list_goals(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.goals.find({**_visible_filter(current_user), "status": {"$ne": "archived"}})
    return [_serialize(g) async for g in cursor.sort("created_at", -1)]


@router.post("")
async def create_goal(payload: GoalCreate, current_user: dict = CurrentUser):
    db = get_db()
    doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "name": payload.name.strip(),
        "category": payload.category,
        "target_amount": payload.target_amount,
        "current_amount": 0.0,
        "deadline": payload.deadline,
        "priority": payload.priority,
        "visibility": payload.visibility,
        "notes": payload.notes,
        "icon": payload.icon,
        "color": payload.color,
        "contributions": [],
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.goals.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.patch("/{goal_id}")
async def update_goal(goal_id: str, payload: GoalUpdate, current_user: dict = CurrentUser):
    db = get_db()
    g = await db.goals.find_one({"_id": ObjectId(goal_id)})
    if not g or g["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Goal not found")
    if g["visibility"] == "PRIVATE" and g["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    updates = payload.model_dump(exclude_none=True)
    if updates:
        await db.goals.update_one({"_id": ObjectId(goal_id)}, {"$set": updates})
    g = await db.goals.find_one({"_id": ObjectId(goal_id)})
    return _serialize(g)


@router.post("/{goal_id}/contribute")
async def contribute(goal_id: str, payload: ContributionRequest, current_user: dict = CurrentUser):
    db = get_db()
    g = await db.goals.find_one({"_id": ObjectId(goal_id)})
    if not g or g["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Goal not found")
    if g["visibility"] == "PRIVATE" and g["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")

    now = payload.date or datetime.now(timezone.utc)
    tx_id = None
    if payload.account_id:
        acct = await db.accounts.find_one({"_id": ObjectId(payload.account_id)})
        if not acct or acct["family_id"] != current_user["family_id"]:
            raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
        if acct["visibility"] == "PRIVATE" and acct["owner_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Tidak diizinkan menggunakan akun ini")
        tx_doc = {
            "family_id": current_user["family_id"],
            "owner_id": current_user["id"],
            "type": "expense",
            "amount": payload.amount,
            "account_id": payload.account_id,
            "to_account_id": None,
            "category_id": None,
            "note": payload.note or f"Kontribusi tabungan: {g['name']}",
            "date": now,
            "status": "posted",
            "visibility": g.get("visibility", "SHARED"),
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc),
            "goal_id": goal_id,
        }
        tx_result = await db.transactions.insert_one(tx_doc)
        tx_id = str(tx_result.inserted_id)
        await db.accounts.update_one({"_id": ObjectId(payload.account_id)}, {"$inc": {"current_balance": -payload.amount}})

    entry = {
        "date": now, "amount": payload.amount, "note": payload.note, "transaction_id": tx_id, "by": current_user["id"],
    }
    await db.goals.update_one(
        {"_id": ObjectId(goal_id)},
        {"$inc": {"current_amount": payload.amount}, "$push": {"contributions": entry}},
    )
    g = await db.goals.find_one({"_id": ObjectId(goal_id)})
    return _serialize(g)


@router.delete("/{goal_id}")
async def archive_goal(goal_id: str, current_user: dict = CurrentUser):
    db = get_db()
    g = await db.goals.find_one({"_id": ObjectId(goal_id)})
    if not g or g["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Goal not found")
    if g["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa mengarsip")
    await db.goals.update_one({"_id": ObjectId(goal_id)}, {"$set": {"status": "archived"}})
    return {"ok": True}
