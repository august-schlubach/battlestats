from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
from typing import Any


def _repo_root() -> Path:
    current = Path(__file__).resolve()
    for candidate in current.parents:
        if (candidate / "docker-compose.yml").exists():
            return candidate
    return current.parents[3]


def _log_root() -> Path:
    return _repo_root() / "server" / "logs" / "agentic"


def write_agent_run_log(engine: str, payload: dict[str, Any]) -> str:
    workflow_id = str(payload.get("workflow_id")
                      or f"{engine}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}")
    target_dir = _log_root() / engine
    target_dir.mkdir(parents=True, exist_ok=True)
    target_file = target_dir / f"{workflow_id}.json"

    enriched_payload = dict(payload)
    enriched_payload.setdefault(
        "logged_at", datetime.utcnow().isoformat() + "Z")
    target_file.write_text(json.dumps(
        enriched_payload, indent=2), encoding="utf-8")
    return str(target_file)
