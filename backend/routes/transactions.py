"""Transaction routes."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query
from bson import ObjectId

from db import get_db
from auth_utils import CurrentUser
from models import TransactionCreate

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _serialize(t: dict) -> dict:
    return {
        "id": str(t["_id"]),
        "family_id": t["family_id"],
        "owner_id": t["owner_id"],
        "type": t["type"],
        "amount": t["amount"],
        "account_id": t["account_id"],
        "to_account_id": t.get("to_account_id"),
        "category_id": t.get("category_id"),
        "note": t.get("note"),
        "date": t["date"],
        "status": t.get("status", "posted"),
        "visibility": t.get("visibility", "PRIVATE"),
        "created_by": t["created_by"],
        "created_at": t["created_at"],
    }


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


async def _apply_balance(db, account_id: str, delta: float):
    await db.accounts.update_one({"_id": ObjectId(account_id)}, {"$inc": {"current_balance": delta}})


@router.get("")
async def list_transactions(
    current_user: dict = CurrentUser,
    limit: int = Query(50, le=200),
    account_id: str | None = None,
):
    db = get_db()
    q = _visible_filter(current_user)
    if account_id:
        q["account_id"] = account_id
    cursor = db.transactions.find(q).sort("date", -1).limit(limit)
    return [_serialize(t) async for t in cursor]


@router.post("")
async def create_transaction(payload: TransactionCreate, current_user: dict = CurrentUser):
    db = get_db()
    # Verify source account belongs to family and user can access
    src = await db.accounts.find_one({"_id": ObjectId(payload.account_id)})
    if not src or src["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Source account not found")
    if src["visibility"] == "PRIVATE" and src["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not permitted to use this account")

    tx_date = payload.date or datetime.now(timezone.utc)
    doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "type": payload.type,
        "amount": payload.amount,
        "account_id": payload.account_id,
        "to_account_id": None,
        "category_id": payload.category_id,
        "note": payload.note,
        "date": tx_date,
        "status": "posted",
        "visibility": payload.visibility,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }

    if payload.type == "expense":
        await _apply_balance(db, payload.account_id, -payload.amount)
    elif payload.type == "income":
        await _apply_balance(db, payload.account_id, payload.amount)
    elif payload.type == "transfer":
        if not payload.to_account_id:
            raise HTTPException(status_code=400, detail="to_account_id required for transfer")
        dst = await db.accounts.find_one({"_id": ObjectId(payload.to_account_id)})
        if not dst or dst["family_id"] != current_user["family_id"]:
            raise HTTPException(status_code=404, detail="Destination account not found")
        if dst["visibility"] == "PRIVATE" and dst["owner_id"] != current_user["id"]:
            raise HTTPException(status_code=403, detail="Not permitted to use destination account")
        doc["to_account_id"] = payload.to_account_id
        await _apply_balance(db, payload.account_id, -payload.amount)
        await _apply_balance(db, payload.to_account_id, payload.amount)

    result = await db.transactions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.delete("/{tx_id}")
async def delete_transaction(tx_id: str, current_user: dict = CurrentUser):
    db = get_db()
    tx = await db.transactions.find_one({"_id": ObjectId(tx_id)})
    if not tx or tx["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if tx["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only the creator can delete")
    # Reverse balance
    if tx["type"] == "expense":
        await _apply_balance(db, tx["account_id"], tx["amount"])
    elif tx["type"] == "income":
        await _apply_balance(db, tx["account_id"], -tx["amount"])
    elif tx["type"] == "transfer":
        await _apply_balance(db, tx["account_id"], tx["amount"])
        if tx.get("to_account_id"):
            await _apply_balance(db, tx["to_account_id"], -tx["amount"])
    await db.transactions.delete_one({"_id": ObjectId(tx_id)})
    return {"ok": True}
