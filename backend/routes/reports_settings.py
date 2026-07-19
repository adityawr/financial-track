"""Reports & Settings routes."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Query
from bson import ObjectId
from pydantic import BaseModel, Field
from typing import Optional

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(tags=["reports-settings"])


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _cycle_bounds_from_day(today: datetime, cycle_day: int) -> tuple[datetime, datetime]:
    """Cycle: cycle_day of prev month → (cycle_day-1) of current month."""
    day = today.day
    if day >= cycle_day:
        start = today.replace(day=cycle_day, hour=0, minute=0, second=0, microsecond=0)
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        # end = day before cycle_day of next month
        end_day = max(1, cycle_day - 1)
        end = datetime(year, month, end_day, 23, 59, 59, tzinfo=timezone.utc)
    else:
        year = today.year - (1 if today.month == 1 else 0)
        month = 12 if today.month == 1 else today.month - 1
        start = datetime(year, month, cycle_day, 0, 0, 0, tzinfo=timezone.utc)
        end_day = max(1, cycle_day - 1)
        end = today.replace(day=end_day, hour=23, minute=59, second=59, microsecond=0)
    return start, end


async def _get_cycle_day(db, family_id: str) -> int:
    fam = await db.families.find_one({"_id": ObjectId(family_id)})
    return int(((fam or {}).get("settings") or {}).get("budget_cycle_day", 25))


# ============= REPORTS =============
reports = APIRouter(prefix="/reports", tags=["reports"])


@reports.get("/cashflow")
async def cashflow(current_user: dict = CurrentUser, months: int = Query(6, ge=1, le=24)):
    """Cash flow per financial period (25 → 24) for the last N cycles."""
    db = get_db()
    cycle_day = await _get_cycle_day(db, current_user["family_id"])
    now = datetime.now(timezone.utc)
    periods = []
    cursor_date = now
    for _ in range(months):
        s, e = _cycle_bounds_from_day(cursor_date, cycle_day)
        periods.append((s, e))
        # go one period earlier
        cursor_date = s - timedelta(days=1)
    periods.reverse()

    out = []
    for start, end in periods:
        pipeline = [
            {"$match": {**_visible_filter(current_user), "date": {"$gte": start, "$lte": end}, "status": "posted"}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]
        totals = {"income": 0.0, "expense": 0.0, "transfer": 0.0}
        async for row in db.transactions.aggregate(pipeline):
            totals[row["_id"]] = row["total"]
        out.append({
            "start": start,
            "end": end,
            "label": start.strftime("%d %b"),
            "income": totals["income"],
            "expense": totals["expense"],
            "cashflow": totals["income"] - totals["expense"],
        })
    return {"cycle_day": cycle_day, "periods": out}


@reports.get("/expense-breakdown")
async def expense_breakdown(current_user: dict = CurrentUser):
    """Current cycle expense grouped by category."""
    db = get_db()
    cycle_day = await _get_cycle_day(db, current_user["family_id"])
    start, end = _cycle_bounds_from_day(datetime.now(timezone.utc), cycle_day)
    pipeline = [
        {"$match": {**_visible_filter(current_user), "type": "expense",
                    "date": {"$gte": start, "$lte": end}, "status": "posted"}},
        {"$group": {"_id": "$category_id", "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        {"$sort": {"total": -1}},
    ]
    rows = []
    async for r in db.transactions.aggregate(pipeline):
        cat = None
        if r["_id"]:
            try:
                cat = await db.categories.find_one({"_id": ObjectId(r["_id"])})
            except Exception:
                cat = None
        rows.append({
            "category_id": r["_id"],
            "category_name": (cat and (cat.get("name_id") or cat.get("name"))) or "Tanpa Kategori",
            "color": cat.get("color") if cat else "#71717A",
            "total": r["total"],
            "count": r["count"],
        })
    total = sum(r["total"] for r in rows) or 0
    for r in rows:
        r["percent"] = round((r["total"] / total) * 100, 2) if total else 0
    return {"start": start, "end": end, "total": total, "rows": rows}


@reports.get("/networth-history")
async def networth_history(current_user: dict = CurrentUser, months: int = Query(6, ge=1, le=24)):
    """Snapshot at end of each cycle: sum of accounts + assets + investments - loans.

    Approximates historical net worth by replaying transactions from account current
    balance backwards. (Assets/investments/loans use current snapshot — historical
    valuation not tracked yet in this version.)
    """
    db = get_db()
    cycle_day = await _get_cycle_day(db, current_user["family_id"])
    now = datetime.now(timezone.utc)

    # Base: current net worth = sum(accounts, subtract credit_card) + assets + investments.current - loans.principal_outstanding
    accounts_bal = 0.0
    async for a in db.accounts.find({**_visible_filter(current_user), "status": {"$ne": "deleted"}}):
        v = a.get("current_balance", 0) or 0
        accounts_bal += -v if a.get("type") == "credit_card" else v
    assets_val = 0.0
    async for a in db.assets.find({**_visible_filter(current_user), "status": {"$ne": "deleted"}}):
        assets_val += a.get("current_value", 0) or 0
    inv_val = 0.0
    async for i in db.investments.find({**_visible_filter(current_user), "status": {"$ne": "closed"}}):
        inv_val += i.get("current_value", 0) or 0
    loans_out = 0.0
    async for lo in db.loans.find({**_visible_filter(current_user), "status": {"$ne": "closed"}}):
        paid_p = sum((s.get("principal", 0) or 0) for s in lo.get("schedule", []) if s.get("status") == "paid")
        loans_out += max(0.0, (lo.get("principal", 0) or 0) - paid_p)

    current_nw = accounts_bal + assets_val + inv_val - loans_out

    # Historical replay of cashflow at end of each cycle
    periods = []
    cursor_date = now
    for _ in range(months):
        s, e = _cycle_bounds_from_day(cursor_date, cycle_day)
        periods.append((s, e))
        cursor_date = s - timedelta(days=1)
    periods.reverse()

    # Walk back from now: for each period from newest to oldest, subtract net cashflow to get earlier snapshot
    tx_by_period = []
    for start, end in periods:
        pipeline = [
            {"$match": {**_visible_filter(current_user), "date": {"$gte": start, "$lte": end}, "status": "posted"}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]
        totals = {"income": 0.0, "expense": 0.0}
        async for row in db.transactions.aggregate(pipeline):
            if row["_id"] in totals:
                totals[row["_id"]] = row["total"]
        tx_by_period.append({"start": start, "end": end, "income": totals["income"], "expense": totals["expense"]})

    # Compute snapshots
    snapshots = []
    running = current_nw
    for p in reversed(tx_by_period):
        snapshots.append({"date": p["end"], "value": round(running, 2), "label": p["start"].strftime("%d %b")})
        running -= (p["income"] - p["expense"])
    snapshots.reverse()

    return {
        "current_net_worth": round(current_nw, 2),
        "components": {
            "accounts": round(accounts_bal, 2),
            "assets": round(assets_val, 2),
            "investments": round(inv_val, 2),
            "loans_outstanding": round(loans_out, 2),
        },
        "series": snapshots,
    }


@reports.get("/summary")
async def report_summary(current_user: dict = CurrentUser):
    """High-level snapshot for the Reports page."""
    db = get_db()
    # Loans
    total_outstanding = 0.0
    active_loans = 0
    async for lo in db.loans.find({**_visible_filter(current_user), "status": {"$ne": "closed"}}):
        active_loans += 1
        paid_p = sum((s.get("principal", 0) or 0) for s in lo.get("schedule", []) if s.get("status") == "paid")
        total_outstanding += max(0.0, (lo.get("principal", 0) or 0) - paid_p)
    # Investments
    inv_principal = 0.0
    inv_current = 0.0
    inv_count = 0
    async for i in db.investments.find({**_visible_filter(current_user), "status": {"$ne": "closed"}}):
        inv_count += 1
        inv_principal += i.get("principal", 0) or 0
        inv_current += i.get("current_value", 0) or 0
    # Goals
    goals_progress = []
    async for g in db.goals.find({**_visible_filter(current_user), "status": {"$ne": "archived"}}):
        target = g.get("target_amount", 0) or 0
        current = g.get("current_amount", 0) or 0
        goals_progress.append({
            "id": str(g["_id"]),
            "name": g["name"],
            "target": target,
            "current": current,
            "progress": min(100, round((current / target) * 100, 2)) if target else 0,
        })
    return {
        "loans": {"active_loans": active_loans, "outstanding": round(total_outstanding, 2)},
        "investments": {
            "count": inv_count,
            "principal": round(inv_principal, 2),
            "current_value": round(inv_current, 2),
            "gain": round(inv_current - inv_principal, 2),
        },
        "goals": goals_progress,
    }


# ============= SETTINGS =============
settings = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    budget_cycle_day: Optional[int] = Field(default=None, ge=1, le=28)
    theme: Optional[str] = None
    language: Optional[str] = None


@settings.get("")
async def get_settings(current_user: dict = CurrentUser):
    db = get_db()
    fam = await db.families.find_one({"_id": ObjectId(current_user["family_id"])})
    s = (fam or {}).get("settings") or {}
    return {
        "budget_cycle_day": s.get("budget_cycle_day", 25),
        "theme": s.get("theme", "dark"),
        "language": s.get("language", "id"),
        "currency": "IDR",
        "family_name": fam.get("name") if fam else None,
    }


@settings.patch("")
async def update_settings(payload: SettingsUpdate, current_user: dict = CurrentUser):
    db = get_db()
    if current_user.get("role") != "Owner":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Hanya Owner")
    updates = {}
    for k, v in payload.model_dump(exclude_none=True).items():
        updates[f"settings.{k}"] = v
    if updates:
        await db.families.update_one({"_id": ObjectId(current_user["family_id"])}, {"$set": updates})
    return await get_settings(current_user)


# combine two sub-routers
router.include_router(reports)
router.include_router(settings)
