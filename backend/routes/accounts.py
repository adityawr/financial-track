"""Account routes."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from bson import ObjectId

from db import get_db
from auth_utils import CurrentUser
from models import AccountCreate, AccountUpdate

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _serialize(a: dict) -> dict:
    return {
        "id": str(a["_id"]),
        "family_id": a["family_id"],
        "owner_id": a["owner_id"],
        "name": a["name"],
        "type": a["type"],
        "provider": a.get("provider"),
        "opening_balance": a.get("opening_balance", 0),
        "current_balance": a.get("current_balance", 0),
        "currency": a.get("currency", "IDR"),
        "color": a.get("color"),
        "icon": a.get("icon"),
        "visibility": a.get("visibility", "PRIVATE"),
        "status": a.get("status", "active"),
        "created_at": a["created_at"],
    }


def _visible_filter(user: dict) -> dict:
    """User sees SHARED accounts in family + own PRIVATE accounts."""
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


@router.get("")
async def list_accounts(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.accounts.find({**_visible_filter(current_user), "status": {"$ne": "deleted"}})
    accounts = [_serialize(a) async for a in cursor]
    return accounts


@router.post("")
async def create_account(payload: AccountCreate, current_user: dict = CurrentUser):
    db = get_db()
    doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "name": payload.name,
        "type": payload.type,
        "provider": payload.provider,
        "opening_balance": payload.opening_balance,
        "current_balance": payload.opening_balance,
        "currency": "IDR",
        "color": payload.color,
        "icon": payload.icon,
        "visibility": payload.visibility,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.accounts.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.patch("/{account_id}")
async def update_account(account_id: str, payload: AccountUpdate, current_user: dict = CurrentUser):
    db = get_db()
    account = await db.accounts.find_one({"_id": ObjectId(account_id)})
    if not account or account["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Account not found")
    if account["visibility"] == "PRIVATE" and account["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not permitted")
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if updates:
        await db.accounts.update_one({"_id": ObjectId(account_id)}, {"$set": updates})
    account = await db.accounts.find_one({"_id": ObjectId(account_id)})
    return _serialize(account)


@router.delete("/{account_id}")
async def delete_account(account_id: str, current_user: dict = CurrentUser):
    db = get_db()
    account = await db.accounts.find_one({"_id": ObjectId(account_id)})
    if not account or account["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Account not found")
    if account["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the account owner can delete it")
    await db.accounts.update_one({"_id": ObjectId(account_id)}, {"$set": {"status": "deleted"}})
    return {"ok": True}
