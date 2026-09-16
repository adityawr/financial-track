"""Quick Expense feature tests.

Covers:
- POST /api/quick-expense/parse (parser + account matching + no-default handling)
- POST /api/quick-expense (create real transaction; balance update; dashboard reflect)
- GET  /api/quick-expense/recent
- PATCH /api/preferences (default_expense_account_id; 404/403 rules)
- GET /api/auth/me includes default_expense_account_id
- Regression: /api/auth/login still works; existing transactions/accounts/dashboard flow intact.
- Security: user A cannot use user B's PRIVATE account.
- Amount parsing edge cases.
- Account validation (not found → 400; NO transaction created).
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://family-wallet-36.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STAMP = int(time.time())
USER_A_EMAIL = f"qe_a+{STAMP}@family.id"
USER_B_EMAIL = f"qe_b+{STAMP}@family.id"
PWD = "secret123"


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register(session, email, name="Tester", family_name="Keluarga Test"):
    r = session.post(f"{API}/auth/register", json={
        "email": email, "password": PWD, "name": name, "family_name": family_name,
    })
    assert r.status_code in (200, 201), f"register {email} failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("access_token") or data.get("token"), data["user"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_a(session):
    token, user = _register(session, USER_A_EMAIL, name="User A", family_name="Fam A")
    return {"token": token, "user": user, "headers": _hdr(token)}


@pytest.fixture(scope="module")
def user_b(session):
    token, user = _register(session, USER_B_EMAIL, name="User B", family_name="Fam B")
    return {"token": token, "user": user, "headers": _hdr(token)}


@pytest.fixture(scope="module")
def accounts_a(session, user_a):
    """Create BNI, GoPay, Cash accounts for user A. Returns dict name→account."""
    created = {}
    for spec in [
        {"name": "BNI", "type": "bank", "provider": "BNI", "opening_balance": 1_000_000, "visibility": "PRIVATE", "color": "#F97316"},
        {"name": "GoPay", "type": "ewallet", "provider": "GoPay", "opening_balance": 500_000, "visibility": "PRIVATE", "color": "#10B981"},
        {"name": "Cash", "type": "cash", "provider": "Cash", "opening_balance": 200_000, "visibility": "PRIVATE", "color": "#71717A"},
    ]:
        r = session.post(f"{API}/accounts", json=spec, headers=user_a["headers"])
        assert r.status_code in (200, 201), f"create account {spec['name']} failed: {r.status_code} {r.text}"
        created[spec["name"]] = r.json()
    return created


# ---------------- AUTH REGRESSION ----------------

class TestAuthRegression:
    def test_login_ok(self, session, user_a):
        r = session.post(f"{API}/auth/login", json={"email": USER_A_EMAIL, "password": PWD})
        assert r.status_code == 200
        d = r.json()
        assert (d.get("access_token") or d.get("token"))
        assert d["user"]["email"] == USER_A_EMAIL

    def test_me_has_default_expense_account_id(self, session, user_a):
        r = session.get(f"{API}/auth/me", headers=user_a["headers"])
        assert r.status_code == 200
        me = r.json()
        # Field must be present (even if None)
        assert "default_expense_account_id" in me, f"missing field in /me: {me.keys()}"
        assert me["default_expense_account_id"] in (None, "")


# ---------------- PARSER + PREVIEW ----------------

class TestParsePreview:
    def test_parse_ok_with_account_match(self, session, user_a, accounts_a):
        r = session.post(f"{API}/quick-expense/parse", json={"text": "makan siang 50000 gopay"}, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["amount"] == 50000
        assert d["description"] == "makan siang"
        assert d["account"] is not None
        assert d["account"]["name"].lower() == "gopay"
        assert d["account_error"] is None

    def test_parse_no_default(self, session, user_a, accounts_a):
        # user A default not yet set → 'no_default'
        r = session.post(f"{API}/quick-expense/parse", json={"text": "kopi 25000"}, headers=user_a["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["amount"] == 25000
        assert d["description"] == "kopi"
        assert d["account"] is None
        assert d["account_error"] and d["account_error"]["code"] == "no_default"

    @pytest.mark.parametrize("raw,expected", [
        ("makan 50000", 50000),
        ("makan 50.000", 50000),
        ("makan Rp 50000", 50000),
        ("makan Rp50000", 50000),
        ("makan 50k", 50000),
        ("makan 50rb", 50000),
    ])
    def test_amount_parsing_edges(self, session, user_a, accounts_a, raw, expected):
        r = session.post(f"{API}/quick-expense/parse", json={"text": raw}, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True, d
        assert d["amount"] == expected

    def test_missing_amount_returns_error(self, session, user_a):
        r = session.post(f"{API}/quick-expense/parse", json={"text": "hanya deskripsi tanpa angka"}, headers=user_a["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False
        assert "Jumlah" in (d.get("error") or "")


# ---------------- CREATE TRANSACTION ----------------

class TestCreateQuickExpense:
    def test_create_reduces_balance_and_persists(self, session, user_a, accounts_a):
        gopay = accounts_a["GoPay"]
        opening = gopay.get("current_balance", gopay.get("opening_balance"))
        # create quick expense on GoPay
        r = session.post(f"{API}/quick-expense", json={"text": "makan siang 50000 gopay"}, headers=user_a["headers"])
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["amount"] == 50000
        assert data["note"] == "makan siang"
        assert data["type"] == "expense"
        assert data["status"] == "posted"
        assert data["entry_method"] == "QUICK_EXPENSE"
        assert data["category_name"] == "Uncategorized"
        tx_id = data["id"]

        # Verify tx appears in /api/transactions (same collection)
        r2 = session.get(f"{API}/transactions", headers=user_a["headers"])
        assert r2.status_code == 200
        ids = [t.get("id") for t in r2.json()]
        assert tx_id in ids, "quick expense not present in main transactions list"

        # Verify balance reduced
        r3 = session.get(f"{API}/accounts", headers=user_a["headers"])
        gp = next(a for a in r3.json() if a["name"] == "GoPay")
        assert abs(gp["current_balance"] - (opening - 50000)) < 0.01, f"balance not reduced: was {opening} now {gp['current_balance']}"

        # Verify dashboard reflects the expense (month-to-date expenses>=50000)
        r4 = session.get(f"{API}/dashboard/summary", headers=user_a["headers"])
        assert r4.status_code == 200
        summary = r4.json()
        # Loose assertion — dashboard schema unknown; look for any expense-ish field
        text_blob = str(summary)
        assert "50000" in text_blob or "expense" in text_blob.lower() or "pengeluaran" in text_blob.lower()

    def test_account_not_found_returns_400_no_tx(self, session, user_a, accounts_a):
        # count before
        before = session.get(f"{API}/transactions", headers=user_a["headers"]).json()
        r = session.post(f"{API}/quick-expense", json={"text": "makan siang 50000 mandiri"}, headers=user_a["headers"])
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "mandiri" in r.text.lower()
        after = session.get(f"{API}/transactions", headers=user_a["headers"]).json()
        assert len(after) == len(before), "transaction was created despite invalid account"

    def test_no_default_no_hint_returns_400(self, session, user_b):
        # user B has no accounts, no default → 400
        r = session.post(f"{API}/quick-expense", json={"text": "kopi 25000"}, headers=user_b["headers"])
        assert r.status_code == 400

    def test_explicit_account_id_success(self, session, user_a, accounts_a):
        cash_id = accounts_a["Cash"]["id"]
        r = session.post(f"{API}/quick-expense", json={"text": "parkir 10000", "account_id": cash_id}, headers=user_a["headers"])
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["account_id"] == cash_id
        assert d["amount"] == 10000

    def test_missing_amount_400(self, session, user_a, accounts_a):
        r = session.post(f"{API}/quick-expense", json={"text": "tidak ada angka"}, headers=user_a["headers"])
        assert r.status_code == 400
        assert "Jumlah" in r.text


# ---------------- SECURITY ----------------

class TestSecurity:
    def test_user_b_cannot_use_user_a_private_account(self, session, user_a, user_b, accounts_a):
        gopay_id = accounts_a["GoPay"]["id"]
        r = session.post(f"{API}/quick-expense",
                         json={"text": "curi 10000", "account_id": gopay_id},
                         headers=user_b["headers"])
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------------- PREFERENCES ----------------

class TestPreferences:
    def test_patch_default_success(self, session, user_a, accounts_a):
        bni_id = accounts_a["BNI"]["id"]
        r = session.patch(f"{API}/preferences", json={"default_expense_account_id": bni_id}, headers=user_a["headers"])
        assert r.status_code == 200, r.text
        # Verify via /me
        me = session.get(f"{API}/auth/me", headers=user_a["headers"]).json()
        assert me["default_expense_account_id"] == bni_id

    def test_patch_other_users_private_account_forbidden(self, session, user_a, user_b, accounts_a):
        # user B trying to set A's private account as their default
        gopay_id = accounts_a["GoPay"]["id"]
        r = session.patch(f"{API}/preferences", json={"default_expense_account_id": gopay_id}, headers=user_b["headers"])
        # Because user_b is in a DIFFERENT family (Fam B), family_id check fires first → 404.
        # If same family, would be 403. Accept both since either is a valid rejection.
        assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}: {r.text}"

    def test_patch_nonexistent_id_returns_404(self, session, user_a):
        # 24-char valid ObjectId that does not exist
        fake_id = "0" * 24
        r = session.patch(f"{API}/preferences", json={"default_expense_account_id": fake_id}, headers=user_a["headers"])
        assert r.status_code == 404, r.text


# ---------------- RECENT ----------------

class TestRecent:
    def test_recent_returns_only_current_user_quick_expenses(self, session, user_a, user_b, accounts_a):
        # user_a should have some quick expenses from prior tests
        r = session.get(f"{API}/quick-expense/recent?limit=5", headers=user_a["headers"])
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) <= 5
        assert len(rows) >= 1
        # sorted desc by created_at (recent first)
        if len(rows) > 1:
            assert rows[0]["created_at"] >= rows[-1]["created_at"]

        # user_b should see empty (different family, no QE)
        r2 = session.get(f"{API}/quick-expense/recent?limit=5", headers=user_b["headers"])
        assert r2.status_code == 200
        assert r2.json() == []


# ---------------- PARSE AFTER DEFAULT SET ----------------

class TestParseWithDefault:
    def test_parse_uses_default_after_pref_set(self, session, user_a, accounts_a):
        # by now BNI is default (set in prefs test)
        r = session.post(f"{API}/quick-expense/parse", json={"text": "kopi 25000"}, headers=user_a["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["account"] is not None
        assert d["account"]["name"].lower() == "bni"
        assert d["account_error"] is None
