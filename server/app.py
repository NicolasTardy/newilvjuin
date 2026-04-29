"""ILV Crédit Vector — backend admin (upload products.json)."""
import json
import os
from datetime import datetime
from pathlib import Path
from flask import Flask, abort, request

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
BACKUPS_DIR = DATA_DIR / "backups"
PRODUCTS_PATH = DATA_DIR / "products.json"
DEPLIANT_PATH = DATA_DIR / "depliant.json"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
PORT = int(os.environ.get("PORT", "3022"))
BACKUPS_KEEP = 10

app = Flask(__name__)


def _check_auth() -> None:
    pwd = request.headers.get("X-Admin-Password", "")
    if not ADMIN_PASSWORD or pwd != ADMIN_PASSWORD:
        abort(401, description="Invalid admin password")


def _atomic_write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _rotate_backup() -> None:
    if not PRODUCTS_PATH.exists():
        return
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUPS_DIR / f"products_{ts}.json"
    dest.write_bytes(PRODUCTS_PATH.read_bytes())
    backups = sorted(BACKUPS_DIR.glob("products_*.json"))
    for old in backups[:-BACKUPS_KEEP]:
        old.unlink()


def _rotate_backup_depliant() -> None:
    if not DEPLIANT_PATH.exists():
        return
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUPS_DIR / f"depliant_{ts}.json"
    dest.write_bytes(DEPLIANT_PATH.read_bytes())
    backups = sorted(BACKUPS_DIR.glob("depliant_*.json"))
    for old in backups[:-BACKUPS_KEEP]:
        old.unlink()


@app.get("/api/health")
def health():
    return {"ok": True, "products_exists": PRODUCTS_PATH.exists()}


@app.post("/api/upload-products")
def upload_products():
    _check_auth()
    payload = request.get_json(silent=True)
    if not isinstance(payload, list) or len(payload) == 0:
        abort(400, description="Expected non-empty JSON array of products")
    _rotate_backup()
    _atomic_write_json(PRODUCTS_PATH, payload)
    return {"ok": True, "count": len(payload)}


@app.post("/api/upload-depliant")
def upload_depliant():
    _check_auth()
    payload = request.get_json(silent=True)
    if not isinstance(payload, list):
        abort(400, description="Expected JSON array of depliant products")
    _rotate_backup_depliant()
    _atomic_write_json(DEPLIANT_PATH, payload)
    return {"ok": True, "count": len(payload)}


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT)
