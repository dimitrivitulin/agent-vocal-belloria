from __future__ import annotations

import re
import sys
from pathlib import Path


REQUIRED = {
    "ACME_EMAIL",
    "BELLORIA_MCP_DOMAIN",
    "BELLORIA_MCP_TOKEN",
    "WAHA_API_KEY",
    "WAHA_DASHBOARD_PASSWORD",
    "WAHA_DASHBOARD_USERNAME",
    "WAHA_IMAGE",
    "WAHA_SESSION",
    "WAHA_WEBHOOK_HMAC_KEY",
}


def validate(path: Path) -> list[str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()

    errors = [f"missing {key}" for key in sorted(REQUIRED - values.keys())]
    for key in sorted(REQUIRED & values.keys()):
        if not values[key] or "change-me" in values[key] or "example.com" in values[key]:
            errors.append(f"{key} still contains a placeholder")

    image = values.get("WAHA_IMAGE", "")
    if image and not re.fullmatch(r"devlikeapro/waha:noweb(?:-arm)?-\d{4}\.\d+\.\d+", image):
        errors.append("WAHA_IMAGE must pin a versioned NOWEB tag")
    for key in ("BELLORIA_MCP_TOKEN", "WAHA_DASHBOARD_PASSWORD", "WAHA_WEBHOOK_HMAC_KEY"):
        value = values.get(key, "")
        if value and "change-me" not in value and len(value) < 32:
            errors.append(f"{key} must contain at least 32 characters")
    api_key = values.get("WAHA_API_KEY", "")
    if api_key and "change-me" not in api_key:
        if len(api_key) < 64:
            errors.append("WAHA_API_KEY must contain at least 64 characters")
        elif not api_key.isalnum():
            errors.append("WAHA_API_KEY must contain only letters and digits")
    return errors


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env.cloud")
    if not path.is_file():
        print(f"missing configuration file: {path}", file=sys.stderr)
        return 2
    errors = validate(path)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("cloud configuration is ready")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
