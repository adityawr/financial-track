"""Pydantic models for Family Financial Tracker."""
from datetime import datetime, timezone
from typing import Optional, Literal, Annotated
from bson import ObjectId
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict


def _to_str(v) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)


PyObjectId = Annotated[str, BeforeValidator(_to_str)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: Optional[PyObjectId] = Field(default=None, alias="_id")


# ---------- User ----------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    avatar_url: Optional[str] = None
    role: Literal["Owner", "Editor", "Viewer", "Child"] = "Owner"
    family_id: str
    created_at: datetime


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    family_name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------- Family ----------
class FamilyPublic(BaseModel):
    id: str
    name: str
    owner_id: str
    currency: str = "IDR"
    created_at: datetime


# ---------- Account ----------
AccountType = Literal["cash", "bank", "ewallet", "credit_card"]
Visibility = Literal["PRIVATE", "SHARED"]


class AccountCreate(BaseModel):
    name: str = Field(min_length=1)
    type: AccountType
    provider: Optional[str] = None  # BCA, BRI, OVO, GoPay, Dana, ShopeePay, Mandiri
    opening_balance: float = 0
    color: Optional[str] = None
    icon: Optional[str] = None
    visibility: Visibility = "PRIVATE"


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[AccountType] = None
    provider: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    visibility: Optional[Visibility] = None
    status: Optional[Literal["active", "archived"]] = None


class AccountPublic(BaseModel):
    id: str
    family_id: str
    owner_id: str
    name: str
    type: AccountType
    provider: Optional[str] = None
    opening_balance: float
    current_balance: float
    currency: str = "IDR"
    color: Optional[str] = None
    icon: Optional[str] = None
    visibility: Visibility
    status: str = "active"
    created_at: datetime


# ---------- Category ----------
CategoryKind = Literal["income", "expense", "transfer"]


class CategoryPublic(BaseModel):
    id: str
    family_id: str
    name: str
    kind: CategoryKind
    icon: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[str] = None


# ---------- Transaction ----------
TxType = Literal["income", "expense", "transfer"]
TxStatus = Literal["pending", "posted", "cancelled"]


class TransactionCreate(BaseModel):
    type: TxType
    amount: float = Field(gt=0)
    account_id: str
    to_account_id: Optional[str] = None  # for transfer
    category_id: Optional[str] = None
    note: Optional[str] = None
    date: Optional[datetime] = None
    visibility: Visibility = "PRIVATE"


class TransactionPublic(BaseModel):
    id: str
    family_id: str
    owner_id: str
    type: TxType
    amount: float
    account_id: str
    to_account_id: Optional[str] = None
    category_id: Optional[str] = None
    note: Optional[str] = None
    date: datetime
    status: TxStatus = "posted"
    visibility: Visibility
    created_by: str
    created_at: datetime
