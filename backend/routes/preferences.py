"""User preferences (per-user, not per-family)."""
from typing import Optional
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PreferenceUpdate(BaseModel):
    default_expense_account_id: Optional[str] = None


@router.get("")
async def get_preferences(current_user: dict = CurrentUser):
    return {
        "default_expense_account_id": current_user.get("default_expense_account_id"),
    }


@router.patch("")
async def update_preferences(payload: PreferenceUpdate, current_user: dict = CurrentUser):
    db = get_db()
    updates = {}
    if payload.default_expense_account_id is not None:
        # Validate: must be an accessible account in this family (or empty string to clear)
        if payload.default_expense_account_id == "":
            updates["default_expense_account_id"] = None
        else:
            acct = await db.accounts.find_one({"_id": ObjectId(payload.default_expense_account_id)})
            if not acct or acct["family_id"] != current_user["family_id"]:
                raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
            if acct.get("visibility") == "PRIVATE" and acct.get("owner_id") != current_user["id"]:
                raise HTTPException(status_code=403, detail="Tidak boleh menggunakan akun pribadi orang lain")
            updates["default_expense_account_id"] = payload.default_expense_account_id
    if updates:
        await db.users.update_one({"_id": ObjectId(current_user["id"])}, {"$set": updates})
    return {"default_expense_account_id": updates.get("default_expense_account_id", current_user.get("default_expense_account_id"))}
