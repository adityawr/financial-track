"""Bug-fix iteration tests for Family Financial Tracker.

Covers:
- Auth regression (login/register)
- Providers auto-seed for new users
- Accounts CRUD incl. edit (PATCH)
- Assets projection field + apply-projection endpoint
- Loans PATCH before payment (schedule regenerates)
- Loans PATCH after payment (core fields blocked)
"""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://family-wallet-36.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STAMP = int(time.time())
USER_EMAIL = f"bugfix+{STAMP}@family.id"
USER_PASSWORD = "secret123"
USER_NAME = "Bug Fix Tester"
FAMILY_NAME = "Keluarga BugFix"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def token(session):
    """Register a fresh user and return bearer token."""
    r = session.post(f"{API}/auth/register", json={
        "email": USER_EMAIL,
        "password": USER_PASSWORD,
        "name": USER_NAME,
        "family_name": FAMILY_NAME,
    })
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data or "access_token" in data, f"No token in response: {data}"
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="session")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ========== AUTH REGRESSION ==========

class TestAuthRegression:
    def test_login_success(self, session, token):
        # Ensure token exists (side-effect of fixture)
        assert token
        r = session.post(f"{API}/auth/login", json={
            "email": USER_EMAIL,
            "password": USER_PASSWORD,
        })
        assert r.status_code == 200, f"Login should return 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("token") or data.get("access_token"), "Login should return token"

    def test_login_wrong_password_returns_401(self, session, token):
        r = session.post(f"{API}/auth/login", json={
            "email": USER_EMAIL,
            "password": "wrongpass",
        })
        assert r.status_code == 401, f"Wrong password should give 401, got {r.status_code}"

    def test_login_endpoint_exists_not_404(self, session):
        r = session.post(f"{API}/auth/login", json={
            "email": "nonexistent@family.id",
            "password": "x",
        })
        assert r.status_code != 404, f"Login endpoint should exist (not 404). Got {r.status_code}"


# ========== BUG FIX 1: PROVIDERS AUTO-SEED ==========

class TestProvidersAutoSeed:
    def test_new_user_gets_seeded_providers(self, session, auth_headers):
        r = session.get(f"{API}/providers", headers=auth_headers)
        assert r.status_code == 200, f"GET /providers failed: {r.status_code} {r.text}"
        providers = r.json()
        assert isinstance(providers, list)
        assert len(providers) >= 16, f"Expected >=16 default providers, got {len(providers)}"

        expected_names = {"BCA", "BRI", "Mandiri", "BNI", "CIMB", "Permata", "Jenius",
                          "OVO", "GoPay", "Dana", "ShopeePay", "LinkAja", "Cash",
                          "BCA Card", "Mandiri Card", "BNI Card"}
        got_names = {p["name"] for p in providers}
        missing = expected_names - got_names
        assert not missing, f"Missing seeded providers: {missing}"


# ========== BUG FIX 2 & 3: ACCOUNT CREATE & EDIT ==========

@pytest.fixture(scope="session")
def created_account(session, auth_headers):
    r = session.post(f"{API}/accounts", headers=auth_headers, json={
        "name": "TEST_BCA_Main",
        "type": "bank",
        "provider": "BCA",
        "opening_balance": 1000000,
        "visibility": "PRIVATE",
    })
    assert r.status_code in (200, 201), f"Create acct: {r.status_code} {r.text}"
    return r.json()


class TestAccountsCRUD:
    def test_create_account(self, created_account):
        assert created_account["name"] == "TEST_BCA_Main"
        assert created_account["type"] == "bank"
        assert created_account["provider"] == "BCA"
        assert created_account["opening_balance"] == 1000000
        assert created_account["current_balance"] == 1000000
        assert "id" in created_account

    def test_get_accounts_persisted(self, session, auth_headers, created_account):
        r = session.get(f"{API}/accounts", headers=auth_headers)
        assert r.status_code == 200
        accts = r.json()
        ids = [a["id"] for a in accts]
        assert created_account["id"] in ids

    def test_patch_account_edit(self, session, auth_headers, created_account):
        acct_id = created_account["id"]
        r = session.patch(f"{API}/accounts/{acct_id}", headers=auth_headers, json={
            "name": "TEST_BCA_Renamed",
            "visibility": "SHARED",
        })
        assert r.status_code == 200, f"PATCH account failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["name"] == "TEST_BCA_Renamed"
        assert data["visibility"] == "SHARED"
        # Balance unchanged
        assert data["current_balance"] == 1000000

        # Verify persistence
        r2 = session.get(f"{API}/accounts", headers=auth_headers)
        found = next((a for a in r2.json() if a["id"] == acct_id), None)
        assert found and found["name"] == "TEST_BCA_Renamed"


# ========== BUG FIX 4: ASSET APPRECIATION/DEPRECIATION ==========

class TestAssetProjection:
    def test_appreciation_asset_projection(self, session, auth_headers):
        # 1M IDR house, purchased 2 years ago, 5% appreciation compounded
        two_years_ago = (datetime.now(timezone.utc) - timedelta(days=730)).isoformat()
        r = session.post(f"{API}/assets", headers=auth_headers, json={
            "name": "TEST_House",
            "category": "house",
            "purchase_value": 1000000000,
            "current_value": 1000000000,
            "purchase_date": two_years_ago,
            "valuation_method": "appreciation",
            "rate_per_year": 5,
            "visibility": "PRIVATE",
        })
        assert r.status_code in (200, 201), f"Create asset: {r.status_code} {r.text}"
        asset = r.json()
        assert asset["valuation_method"] == "appreciation"
        assert asset["rate_per_year"] == 5
        projected = asset.get("projected_value")
        assert projected is not None, f"projected_value should be computed, got None. Asset={asset}"
        # Approx 1_000_000_000 * 1.05^2 = 1_102_500_000
        assert 1_090_000_000 <= projected <= 1_115_000_000, f"projected={projected} out of expected range"

        # Apply projection
        asset_id = asset["id"]
        r2 = session.post(f"{API}/assets/{asset_id}/apply-projection", headers=auth_headers)
        assert r2.status_code == 200, f"apply-projection failed: {r2.status_code} {r2.text}"
        updated = r2.json()
        assert abs(updated["current_value"] - projected) < 1, (
            f"After apply, current_value should equal projected. cv={updated['current_value']} projected={projected}"
        )

    def test_depreciation_asset_projection(self, session, auth_headers):
        # Vehicle 300M IDR, 1 yr ago, 10% depre → 270M
        one_year_ago = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
        r = session.post(f"{API}/assets", headers=auth_headers, json={
            "name": "TEST_Vehicle",
            "category": "vehicle",
            "purchase_value": 300000000,
            "current_value": 300000000,
            "purchase_date": one_year_ago,
            "valuation_method": "depreciation",
            "rate_per_year": 10,
            "visibility": "PRIVATE",
        })
        assert r.status_code in (200, 201), f"Create vehicle: {r.status_code} {r.text}"
        asset = r.json()
        projected = asset.get("projected_value")
        assert projected is not None
        # 300M * (1 - 0.10 * 1) = 270M
        assert projected < 300000000, f"Depreciated value must be lower than purchase: {projected}"
        assert 265_000_000 <= projected <= 275_000_000, f"projected={projected} out of expected range"

    def test_manual_method_no_projection(self, session, auth_headers):
        r = session.post(f"{API}/assets", headers=auth_headers, json={
            "name": "TEST_Cash",
            "category": "other",
            "purchase_value": 5000000,
            "current_value": 5000000,
            "valuation_method": "manual",
            "visibility": "PRIVATE",
        })
        assert r.status_code in (200, 201)
        asset = r.json()
        assert asset.get("projected_value") is None


# ========== BUG FIX 5: LOAN EDIT ==========

@pytest.fixture(scope="session")
def created_loan(session, auth_headers):
    r = session.post(f"{API}/loans", headers=auth_headers, json={
        "name": "TEST_Loan_Main",
        "type": "personal",
        "lender": "Bank X",
        "principal": 500000000,
        "interest_rate_annual": 6,
        "term_months": 60,
        "start_date": datetime.now(timezone.utc).isoformat(),
        "visibility": "SHARED",
    })
    assert r.status_code in (200, 201), f"Create loan: {r.status_code} {r.text}"
    return r.json()


class TestLoanEdit:
    def test_create_loan_baseline(self, created_loan):
        assert created_loan["principal"] == 500000000
        assert created_loan["term_months"] == 60
        assert len(created_loan["schedule"]) == 60
        assert created_loan["monthly_installment"] > 0

    def test_patch_loan_before_payment_regenerates_schedule(self, session, auth_headers, created_loan):
        loan_id = created_loan["id"]
        original_installment = created_loan["monthly_installment"]
        r = session.patch(f"{API}/loans/{loan_id}", headers=auth_headers, json={
            "principal": 600000000,
            "term_months": 72,
        })
        assert r.status_code == 200, f"PATCH loan failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["principal"] == 600000000
        assert data["term_months"] == 72
        assert len(data["schedule"]) == 72
        assert data["monthly_installment"] != original_installment

    def test_patch_loan_metadata_only_after_payment(self, session, auth_headers):
        # Create a fresh loan
        r = session.post(f"{API}/loans", headers=auth_headers, json={
            "name": "TEST_Loan_ToPay",
            "type": "personal",
            "lender": "Bank Y",
            "principal": 100000000,
            "interest_rate_annual": 5,
            "term_months": 24,
            "start_date": datetime.now(timezone.utc).isoformat(),
            "visibility": "SHARED",
        })
        assert r.status_code in (200, 201)
        loan = r.json()
        loan_id = loan["id"]

        # Pay installment #1 (no account_id → no txn created)
        rp = session.post(f"{API}/loans/{loan_id}/pay", headers=auth_headers, json={
            "installment_no": 1,
        })
        assert rp.status_code == 200, f"Pay failed: {rp.status_code} {rp.text}"

        # Now attempt to PATCH core fields → should be blocked
        rc = session.patch(f"{API}/loans/{loan_id}", headers=auth_headers, json={
            "principal": 200000000,
        })
        assert rc.status_code == 400, f"Should block core-field edit after payment, got {rc.status_code} {rc.text}"

        # Metadata edit still allowed
        rm = session.patch(f"{API}/loans/{loan_id}", headers=auth_headers, json={
            "name": "TEST_Loan_Renamed",
            "lender": "New Lender",
        })
        assert rm.status_code == 200, f"Metadata PATCH after payment failed: {rm.status_code} {rm.text}"
        assert rm.json()["name"] == "TEST_Loan_Renamed"
        assert rm.json()["lender"] == "New Lender"
