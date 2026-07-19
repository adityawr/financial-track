"""Loans: Mortgage, Employee, Vehicle, Personal, Credit Card.

Amortization schedule (fixed monthly) computed at creation.
Payments tracked per installment. Optional link to Transaction.
"""
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from typing import Optional, Literal
from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pydantic import BaseModel, Field

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/loans", tags=["loans"])

LoanType = Literal["mortgage", "employee", "vehicle", "personal", "credit_card"]
Visibility = Literal["PRIVATE", "SHARED"]


class LoanCreate(BaseModel):
    name: str = Field(min_length=1)
    type: LoanType
    lender: Optional[str] = None
    principal: float = Field(gt=0)              # pokok pinjaman
    interest_rate_annual: float = Field(ge=0)   # % per tahun
    term_months: int = Field(gt=0, le=600)      # jumlah cicilan
    start_date: datetime
    visibility: Visibility = "SHARED"
    notes: Optional[str] = None


class PaymentRequest(BaseModel):
    installment_no: int = Field(gt=0)
    amount: Optional[float] = None
    paid_date: Optional[datetime] = None
    account_id: Optional[str] = None  # jika diisi → create expense transaction
    note: Optional[str] = None


def _amortization_schedule(principal: float, annual_rate_pct: float, months: int, start: datetime):
    """Standard fixed-payment amortization."""
    r = (annual_rate_pct / 100.0) / 12.0
    if r == 0:
        installment = principal / months
    else:
        installment = principal * r * (1 + r) ** months / ((1 + r) ** months - 1)
    schedule = []
    balance = principal
    for i in range(1, months + 1):
        interest = balance * r
        principal_part = installment - interest
        balance = max(0.0, balance - principal_part)
        due_date = start + relativedelta(months=+ (i - 1))
        schedule.append({
            "no": i,
            "due_date": due_date,
            "installment": round(installment, 2),
            "principal": round(principal_part, 2),
            "interest": round(interest, 2),
            "balance": round(balance, 2),
            "status": "unpaid",  # unpaid | paid | overdue
            "paid_amount": 0,
            "paid_date": None,
            "transaction_id": None,
        })
    return round(installment, 2), schedule


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _refresh_status(loan: dict) -> dict:
    """Compute outstanding_balance, paid_count, next_due from schedule."""
    schedule = loan.get("schedule", [])
    now = datetime.now(timezone.utc)
    paid = sum(1 for s in schedule if s.get("status") == "paid")
    outstanding = sum((s.get("installment", 0) or 0) for s in schedule if s.get("status") != "paid")
    principal_paid = sum((s.get("principal", 0) or 0) for s in schedule if s.get("status") == "paid")
    principal_outstanding = max(0.0, (loan.get("principal", 0) or 0) - principal_paid)
    next_due = next((s for s in schedule if s.get("status") != "paid"), None)
    # overdue tag
    for s in schedule:
        if s.get("status") != "paid":
            due = s.get("due_date")
            if isinstance(due, str):
                try:
                    due = datetime.fromisoformat(due)
                except Exception:
                    due = None
            if due and due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if due and due < now:
                s["status"] = "overdue"
    loan["outstanding_balance"] = round(outstanding, 2)
    loan["principal_outstanding"] = round(principal_outstanding, 2)
    loan["paid_installments"] = paid
    loan["total_installments"] = len(schedule)
    loan["next_due"] = next_due
    return loan


def _serialize(loan: dict) -> dict:
    loan = _refresh_status(dict(loan))
    return {
        "id": str(loan["_id"]),
        "family_id": loan["family_id"],
        "owner_id": loan["owner_id"],
        "name": loan["name"],
        "type": loan["type"],
        "lender": loan.get("lender"),
        "principal": loan.get("principal", 0),
        "interest_rate_annual": loan.get("interest_rate_annual", 0),
        "term_months": loan.get("term_months", 0),
        "monthly_installment": loan.get("monthly_installment", 0),
        "start_date": loan.get("start_date"),
        "visibility": loan.get("visibility", "SHARED"),
        "notes": loan.get("notes"),
        "schedule": loan.get("schedule", []),
        "outstanding_balance": loan.get("outstanding_balance", 0),
        "principal_outstanding": loan.get("principal_outstanding", 0),
        "paid_installments": loan.get("paid_installments", 0),
        "total_installments": loan.get("total_installments", 0),
        "next_due": loan.get("next_due"),
        "status": loan.get("status", "active"),
        "created_at": loan["created_at"],
    }


@router.get("")
async def list_loans(current_user: dict = CurrentUser):
    db = get_db()
    cursor = db.loans.find({**_visible_filter(current_user), "status": {"$ne": "closed"}})
    return [_serialize(l) async for l in cursor.sort("created_at", -1)]


@router.get("/{loan_id}")
async def get_loan(loan_id: str, current_user: dict = CurrentUser):
    db = get_db()
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan or loan["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan["visibility"] == "PRIVATE" and loan["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")
    return _serialize(loan)


@router.post("")
async def create_loan(payload: LoanCreate, current_user: dict = CurrentUser):
    db = get_db()
    start = payload.start_date
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    installment, schedule = _amortization_schedule(
        payload.principal, payload.interest_rate_annual, payload.term_months, start
    )
    doc = {
        "family_id": current_user["family_id"],
        "owner_id": current_user["id"],
        "name": payload.name.strip(),
        "type": payload.type,
        "lender": payload.lender,
        "principal": payload.principal,
        "interest_rate_annual": payload.interest_rate_annual,
        "term_months": payload.term_months,
        "monthly_installment": installment,
        "start_date": start,
        "visibility": payload.visibility,
        "notes": payload.notes,
        "schedule": schedule,
        "status": "active",
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.loans.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.post("/{loan_id}/pay")
async def pay_installment(loan_id: str, payload: PaymentRequest, current_user: dict = CurrentUser):
    db = get_db()
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan or loan["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan["visibility"] == "PRIVATE" and loan["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Tidak diizinkan")

    schedule = loan.get("schedule", [])
    idx = next((n for n, s in enumerate(schedule) if s["no"] == payload.installment_no), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Cicilan tidak ditemukan")
    if schedule[idx].get("status") == "paid":
        raise HTTPException(status_code=400, detail="Cicilan sudah dibayar")

    amount = payload.amount if payload.amount is not None else schedule[idx]["installment"]
    paid_date = payload.paid_date or datetime.now(timezone.utc)
    tx_id = None

    # Optional: create expense transaction that reduces the paying account
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
            "amount": amount,
            "account_id": payload.account_id,
            "to_account_id": None,
            "category_id": None,
            "note": payload.note or f"Angsuran {loan['name']} #{payload.installment_no}",
            "date": paid_date,
            "status": "posted",
            "visibility": loan.get("visibility", "SHARED"),
            "created_by": current_user["id"],
            "created_at": datetime.now(timezone.utc),
            "loan_id": loan_id,
        }
        tx_result = await db.transactions.insert_one(tx_doc)
        tx_id = str(tx_result.inserted_id)
        await db.accounts.update_one({"_id": ObjectId(payload.account_id)}, {"$inc": {"current_balance": -amount}})

    schedule[idx]["status"] = "paid"
    schedule[idx]["paid_amount"] = amount
    schedule[idx]["paid_date"] = paid_date
    schedule[idx]["transaction_id"] = tx_id
    await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$set": {"schedule": schedule}})
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    return _serialize(loan)


@router.delete("/{loan_id}")
async def delete_loan(loan_id: str, current_user: dict = CurrentUser):
    db = get_db()
    loan = await db.loans.find_one({"_id": ObjectId(loan_id)})
    if not loan or loan["family_id"] != current_user["family_id"]:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Hanya pemilik yang bisa menutup")
    await db.loans.update_one({"_id": ObjectId(loan_id)}, {"$set": {"status": "closed"}})
    return {"ok": True}
