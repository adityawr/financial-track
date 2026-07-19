"""Dashboard aggregation routes."""
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter

from db import get_db
from auth_utils import CurrentUser

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _visible_filter(user: dict) -> dict:
    return {
        "family_id": user["family_id"],
        "$or": [
            {"visibility": "SHARED"},
            {"visibility": "PRIVATE", "owner_id": user["id"]},
        ],
    }


def _current_cycle_bounds(today: datetime, cycle_day: int = 25) -> tuple[datetime, datetime]:
    """Budget cycle: cycle_day of prev month → (cycle_day-1) of current month."""
    day = today.day
    end_day = max(1, cycle_day - 1)
    if day >= cycle_day:
        start = today.replace(day=cycle_day, hour=0, minute=0, second=0, microsecond=0)
        year = today.year + (1 if today.month == 12 else 0)
        month = 1 if today.month == 12 else today.month + 1
        end = datetime(year, month, end_day, 23, 59, 59, tzinfo=timezone.utc)
    else:
        year = today.year - (1 if today.month == 1 else 0)
        month = 12 if today.month == 1 else today.month - 1
        start = datetime(year, month, cycle_day, 0, 0, 0, tzinfo=timezone.utc)
        end = today.replace(day=end_day, hour=23, minute=59, second=59, microsecond=0)
    return start, end


@router.get("/summary")
async def dashboard_summary(current_user: dict = CurrentUser):
    db = get_db()

    # Accounts (visible)
    accounts_cursor = db.accounts.find({
        **_visible_filter(current_user),
        "status": {"$ne": "deleted"},
    })
    net_worth = 0.0
    account_count = 0
    async for a in accounts_cursor:
        bal = a.get("current_balance", 0) or 0
        # credit_card counts as liability
        if a.get("type") == "credit_card":
            net_worth -= bal
        else:
            net_worth += bal
        account_count += 1

    # Current financial cycle (uses family settings.budget_cycle_day; default 25)
    fam = await db.families.find_one({"_id": ObjectId(current_user["family_id"])})
    cycle_day = int(((fam or {}).get("settings") or {}).get("budget_cycle_day", 25))
    now = datetime.now(timezone.utc)
    cycle_start, cycle_end = _current_cycle_bounds(now, cycle_day)

    match_tx = {
        **_visible_filter(current_user),
        "date": {"$gte": cycle_start, "$lte": cycle_end},
        "status": "posted",
    }

    pipeline = [
        {"$match": match_tx},
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
    ]
    totals = {"income": 0.0, "expense": 0.0, "transfer": 0.0}
    async for row in db.transactions.aggregate(pipeline):
        totals[row["_id"]] = row["total"]

    # Recent (any date) top 8
    recent = []
    cursor = db.transactions.find(_visible_filter(current_user)).sort("date", -1).limit(8)
    async for t in cursor:
        recent.append({
            "id": str(t["_id"]),
            "type": t["type"],
            "amount": t["amount"],
            "account_id": t["account_id"],
            "to_account_id": t.get("to_account_id"),
            "category_id": t.get("category_id"),
            "note": t.get("note"),
            "date": t["date"],
            "visibility": t.get("visibility", "PRIVATE"),
            "owner_id": t["owner_id"],
        })

    return {
        "net_worth": net_worth,
        "account_count": account_count,
        "cycle_start": cycle_start,
        "cycle_end": cycle_end,
        "period_income": totals["income"],
        "period_expense": totals["expense"],
        "period_cashflow": totals["income"] - totals["expense"],
        "recent_transactions": recent,
    }
