"""MongoDB connection & startup helpers."""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient = None
_db: AsyncIOMotorDatabase = None


def init_db():
    global _client, _db
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    _client = AsyncIOMotorClient(mongo_url)
    _db = _client[db_name]
    return _db


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        return init_db()
    return _db


def close_db():
    if _client:
        _client.close()


async def ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.accounts.create_index([("family_id", 1)])
    await db.accounts.create_index([("owner_id", 1)])
    await db.transactions.create_index([("family_id", 1), ("date", -1)])
    await db.transactions.create_index([("account_id", 1)])
    await db.categories.create_index([("family_id", 1)])
    await db.family_invites.create_index("token", unique=True)
    await db.family_invites.create_index([("family_id", 1), ("email", 1), ("status", 1)])
    await db.providers.create_index([("family_id", 1), ("type", 1)])
    await db.assets.create_index([("family_id", 1)])
    await db.investments.create_index([("family_id", 1)])
    await db.loans.create_index([("family_id", 1)])
    await db.goals.create_index([("family_id", 1)])


DEFAULT_CATEGORIES = [
    # income
    {"name": "Salary", "name_id": "Gaji", "kind": "income", "icon": "briefcase", "color": "#10B981"},
    {"name": "Bonus", "name_id": "Bonus", "kind": "income", "icon": "gift", "color": "#059669"},
    {"name": "Business", "name_id": "Bisnis", "kind": "income", "icon": "building-2", "color": "#0EA5E9"},
    {"name": "Investment", "name_id": "Investasi", "kind": "income", "icon": "trending-up", "color": "#C5A880"},
    # expense
    {"name": "Food", "name_id": "Makanan", "kind": "expense", "icon": "utensils", "color": "#F43F5E"},
    {"name": "Fuel", "name_id": "BBM", "kind": "expense", "icon": "fuel", "color": "#F97316"},
    {"name": "Shopping", "name_id": "Belanja", "kind": "expense", "icon": "shopping-bag", "color": "#EC4899"},
    {"name": "Utilities", "name_id": "Tagihan", "kind": "expense", "icon": "zap", "color": "#EAB308"},
    {"name": "Medical", "name_id": "Kesehatan", "kind": "expense", "icon": "heart-pulse", "color": "#EF4444"},
    {"name": "Education", "name_id": "Pendidikan", "kind": "expense", "icon": "graduation-cap", "color": "#8B5CF6"},
    {"name": "Entertainment", "name_id": "Hiburan", "kind": "expense", "icon": "clapperboard", "color": "#A855F7"},
    {"name": "Transport", "name_id": "Transportasi", "kind": "expense", "icon": "car", "color": "#06B6D4"},
    # transfer
    {"name": "Transfer", "name_id": "Transfer", "kind": "transfer", "icon": "arrow-right-left", "color": "#A1A1AA"},
]


async def seed_family_categories(family_id: str):
    db = get_db()
    existing = await db.categories.count_documents({"family_id": family_id})
    if existing > 0:
        return
    docs = [{**c, "family_id": family_id} for c in DEFAULT_CATEGORIES]
    await db.categories.insert_many(docs)


DEFAULT_PROVIDERS = [
    # Banks
    {"name": "BCA", "type": "bank", "color": "#005EAA"},
    {"name": "BRI", "type": "bank", "color": "#003D79"},
    {"name": "Mandiri", "type": "bank", "color": "#F2A900"},
    {"name": "BNI", "type": "bank", "color": "#EE7D11"},
    {"name": "CIMB", "type": "bank", "color": "#8E2323"},
    {"name": "Permata", "type": "bank", "color": "#005E3C"},
    {"name": "Jenius", "type": "bank", "color": "#00A5DC"},
    # E-wallets
    {"name": "OVO", "type": "ewallet", "color": "#4C3494"},
    {"name": "GoPay", "type": "ewallet", "color": "#00AED6"},
    {"name": "Dana", "type": "ewallet", "color": "#118EEA"},
    {"name": "ShopeePay", "type": "ewallet", "color": "#EE4D2D"},
    {"name": "LinkAja", "type": "ewallet", "color": "#E30613"},
    # Cash
    {"name": "Cash", "type": "cash", "color": "#71717A"},
    # Credit cards
    {"name": "BCA Card", "type": "credit_card", "color": "#005EAA"},
    {"name": "Mandiri Card", "type": "credit_card", "color": "#F2A900"},
    {"name": "BNI Card", "type": "credit_card", "color": "#EE7D11"},
]


async def seed_family_providers(family_id: str):
    from datetime import datetime, timezone
    db = get_db()
    existing = await db.providers.count_documents({"family_id": family_id})
    if existing > 0:
        return
    now = datetime.now(timezone.utc)
    docs = [{**p, "family_id": family_id, "is_default": True, "created_at": now} for p in DEFAULT_PROVIDERS]
    await db.providers.insert_many(docs)
