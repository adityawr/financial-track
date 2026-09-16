"""Quick Expense — freestyle text-based expense entry.

Reuses existing transactions collection, account access filter,
and balance-update logic. Adds only:
  - entry_method: "QUICK_EXPENSE" (metadata)
  - original_input: raw text (metadata)
"""
import re
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/quick-expense", tags=["quick-expense"])


# ---------------------- Parser ----------------------
AMOUNT_TOKEN_RE = re.compile(r"^(?:rp)?[\d.,]+(k|rb)?$", re.IGNORECASE)


def parse_amount_token(tok: str) -> Optional[int]:
    """Parse a single token into integer amount (IDR). Returns None if not a valid amount."""
    t = tok.strip().lower()
    if not t:
        return None
    if t.startswith("rp"):
        t = t[2:].strip()
    multiplier = 1
    if t.endswith("rb"):
        t = t[:-2]
        multiplier = 1000
    elif t.endswith("k"):
        t = t[:-1]
        multiplier = 1000
    # Strip thousand separators (both . and , since Indonesian may use either)
    t = t.replace(".", "").replace(",", "").replace(" ", "")
    if not t.isdigit():
        return None
    v = int(t) * multiplier
    return v if v > 0 else None


def parse_freestyle(text: str) -> dict:
    """Parse `[description] [amount] [optional account]`.

    Returns dict with keys ok/description/amount/account_hint/error.
    """
    raw = (text or "").strip()
    if not raw:
        return {"ok": False, "error": "Input kosong."}
    # Collapse "rp <n>" → "rp<n>" so it becomes a single token
    normalized = re.sub(r"\brp\s+(\d)", r"rp\1", raw, flags=re.IGNORECASE)
    tokens = normalized.split()

    amount = None
    amount_idx = -1
    for i, tok in enumerate(tokens):
        v = parse_amount_token(tok)
        if v is not None:
            amount = v
            amount_idx = i
            break

    if amount is None:
        return {"ok": False, "error": "Jumlah tidak terdeteksi. Contoh: 'makan siang 50000'."}

    desc_tokens = tokens[:amount_idx]
    if not desc_tokens:
        return {"ok": False, "error": "Deskripsi wajib diisi sebelum jumlah."}
    account_tokens = tokens[amount_idx + 1:]
    account_hint = " ".join(account_tokens).strip() or None
    description = " ".join(desc_tokens).strip()
    return {
        "ok": True,
        "amount": amount,
        "description": description,
        "account_hint": account_hint,
    }


# ---------------------- Account matching ----------------------
def _visible_accounts_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "status": {"$ne": "deleted"},
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


async def _accessible_accounts(db, user: dict) -> list:
    return [a async for a in db.accounts.find(_visible_accounts_filter(user))]


def _match_account(hint: str, accounts: list):
    """Return (account_dict, error) — one of them None. Error is a dict with a `code` and message."""
    h = (hint or "").lower().strip()
    if not h:
        return None, {"code": "not_provided", "message": "Akun tidak disebut."}

    exact_name = [a for a in accounts if (a.get("name") or "").lower() == h]
    if len(exact_name) == 1:
        return exact_name[0], None
    if len(exact_name) > 1:
        return None, {
            "code": "ambiguous",
            "message": f'Beberapa akun cocok dengan "{hint}". Pilih salah satu.',
            "candidates": [{"id": str(a["_id"]), "name": a["name"], "provider": a.get("provider")} for a in exact_name],
        }

    exact_provider = [a for a in accounts if (a.get("provider") or "").lower() == h]
    if len(exact_provider) == 1:
        return exact_provider[0], None
    if len(exact_provider) > 1:
        return None, {
            "code": "ambiguous",
            "message": f'Beberapa akun cocok dengan "{hint}". Pilih salah satu.',
            "candidates": [{"id": str(a["_id"]), "name": a["name"], "provider": a.get("provider")} for a in exact_provider],
        }

    return None, {
        "code": "not_found",
        "message": f'Akun "{hint}" tidak ditemukan atau tidak dapat diakses.',
    }


# ---------------------- Uncategorized ----------------------
async def _ensure_uncategorized(db, family_id: str) -> str:
    """Return id of the family's Uncategorized expense category, creating if missing."""
    cat = await db.categories.find_one({
        "family_id": family_id,
        "kind": "expense",
        "name": "Uncategorized",
    })
    if cat:
        return str(cat["_id"])
    doc = {
        "family_id": family_id,
        "name": "Uncategorized",
        "name_id": "Belum Dikategorikan",
        "kind": "expense",
        "icon": "circle-help",
        "color": "#71717A",
    }
    result = await db.categories.insert_one(doc)
    return str(result.inserted_id)


# ---------------------- Endpoints ----------------------
class QuickExpenseRequest(BaseModel):
    text: str
    account_id: Optional[str] = None  # explicit override (used when preview shows ambiguous/no-default)
    visibility: Optional[str] = "PRIVATE"


class ParseRequest(BaseModel):
    text: str


@router.post("/parse")
async def parse_preview(payload: ParseRequest, current_user: dict = CurrentUser):
    """Preview parse (backend-authoritative). Returns interpreted fields but does NOT insert."""
    db = get_db()
    result = parse_freestyle(payload.text)
    if not result["ok"]:
        return {**result, "amount": None, "description": None, "account_hint": None, "account": None}

    accounts = await _accessible_accounts(db, current_user)
    acct = None
    err = None
    if result.get("account_hint"):
        acct, err = _match_account(result["account_hint"], accounts)
    else:
        # Fallback to user's default
        default_id = current_user.get("default_expense_account_id")
        if default_id:
            acct = next((a for a in accounts if str(a["_id"]) == default_id), None)
            if not acct:
                err = {"code": "default_missing", "message": "Akun default tidak lagi dapat diakses. Pilih akun."}
        else:
            err = {"code": "no_default", "message": "Belum ada akun default. Pilih akun atau atur default."}

    return {
        "ok": True,
        "amount": result["amount"],
        "description": result["description"],
        "account_hint": result.get("account_hint"),
        "account": None if not acct else {
            "id": str(acct["_id"]),
            "name": acct["name"],
            "provider": acct.get("provider"),
            "type": acct.get("type"),
            "color": acct.get("color"),
            "visibility": acct.get("visibility"),
            "current_balance": acct.get("current_balance"),
        },
        "account_error": err,
    }


@router.post("")
async def create_quick_expense(payload: QuickExpenseRequest, current_user: dict = CurrentUser):
    """Parse + validate + insert an expense transaction. Uses existing transactions collection."""
    db = get_db()
    parsed = parse_freestyle(payload.text)
    if not parsed["ok"]:
        raise HTTPException(status_code=400, detail=parsed["error"])

    accounts = await _accessible_accounts(db, current_user)

    # Resolve account (in priority: explicit account_id > parsed hint > default)
    acct = None
    if payload.account_id:
        acct = next((a for a in accounts if str(a["_id"]) == payload.account_id), None)
        if not acct:
            raise HTTPException(status_code=403, detail="Akun tidak ditemukan atau tidak dapat diakses.")
    elif parsed.get("account_hint"):
        acct, err = _match_account(parsed["account_hint"], accounts)
        if err:
            raise HTTPException(status_code=400, detail=err["message"])
    else:
        default_id = current_user.get("default_expense_account_id")
        if not default_id:
            raise HTTPException(status_code=400, detail="Belum ada akun default. Pilih akun atau atur default.")
        acct = next((a for a in accounts if str(a["_id"]) == default_id), None)
        if not acct:
            raise HTTPException(status_code=400, detail="Akun default tidak lagi dapat diakses. Pilih akun.")

    # Ensure Uncategorized category exists for this family
    uncategorized_id = await _ensure_uncategorized(db, current_user["family_id"])

    now = datetime.now(timezone.utc)
    vis = payload.visibility if payload.visibility in ("PRIVATE", "SHARED") else "PRIVATE"

    tx_doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "type": "expense",
        "amount": float(parsed["amount"]),
        "account_id": str(acct["_id"]),
        "to_account_id": None,
        "category_id": uncategorized_id,
        "note": parsed["description"],
        "date": now,
        "status": "posted",
        "visibility": vis,
        "created_by": current_user["id"],
        "created_at": now,
        # Quick Expense metadata (does not duplicate financial data)
        "entry_method": "QUICK_EXPENSE",
        "original_input": payload.text.strip(),
    }
    result = await db.transactions.insert_one(tx_doc)
    # Update account balance using same $inc pattern the normal transactions route uses
    await db.accounts.update_one({"_id": ObjectId(str(acct["_id"]))}, {"$inc": {"current_balance": -float(parsed["amount"])}})

    return {
        "id": str(result.inserted_id),
        "amount": tx_doc["amount"],
        "note": tx_doc["note"],
        "account_id": tx_doc["account_id"],
        "account_name": acct["name"],
        "account_provider": acct.get("provider"),
        "category_id": tx_doc["category_id"],
        "category_name": "Uncategorized",
        "type": tx_doc["type"],
        "status": tx_doc["status"],
        "visibility": tx_doc["visibility"],
        "date": tx_doc["date"],
        "entry_method": tx_doc["entry_method"],
    }


@router.get("/recent")
async def recent_quick_expenses(current_user: dict = CurrentUser, limit: int = 5):
    db = get_db()
    cursor = db.transactions.find({
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "entry_method": "QUICK_EXPENSE",
    }).sort("created_at", -1).limit(min(max(1, limit), 25))
    # Batch load accounts
    accounts_by_id = {}
    async for a in db.accounts.find({"family_id": current_user["family_id"]}):
        accounts_by_id[str(a["_id"])] = a
    rows = []
    async for t in cursor:
        acct = accounts_by_id.get(str(t.get("account_id")))
        rows.append({
            "id": str(t["_id"]),
            "amount": t.get("amount", 0),
            "note": t.get("note"),
            "date": t.get("date"),
            "created_at": t.get("created_at"),
            "account_id": t.get("account_id"),
            "account_name": acct["name"] if acct else None,
            "account_color": acct.get("color") if acct else None,
            "visibility": t.get("visibility", "PRIVATE"),
            "original_input": t.get("original_input"),
        })
    return rows
