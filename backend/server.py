"""Family Financial Tracker — FastAPI entrypoint."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging  # noqa: E402
import os  # noqa: E402
from fastapi import FastAPI, APIRouter  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402
from starlette.requests import Request  # noqa: E402

from db import init_db, close_db, ensure_indexes  # noqa: E402
from routes.auth import router as auth_router  # noqa: E402
from routes.family import router as family_router  # noqa: E402
from routes.accounts import router as accounts_router  # noqa: E402
from routes.transactions import router as transactions_router  # noqa: E402
from routes.categories import router as categories_router  # noqa: E402
from routes.dashboard import router as dashboard_router  # noqa: E402

app = FastAPI(title="Family Financial Tracker API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"name": "Family Financial Tracker", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "ok"}


api_router.include_router(auth_router)
api_router.include_router(family_router)
api_router.include_router(accounts_router)
api_router.include_router(transactions_router)
api_router.include_router(categories_router)
api_router.include_router(dashboard_router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def _startup():
    init_db()
    await ensure_indexes()
    logger.info("Family Wealth API started, indexes ensured.")


@app.on_event("shutdown")
async def _shutdown():
    close_db()


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})
