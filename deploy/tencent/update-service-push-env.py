#!/usr/bin/env python3
"""Update only the independent customer-service PWA secrets from JSON stdin."""
import json
import os
import sys
import tempfile

path = "/srv/fuchong/shared/.env.production"
allowed = {
    "WEB_PUSH_PUBLIC_KEY",
    "WEB_PUSH_PRIVATE_KEY",
    "WEB_PUSH_SUBJECT",
}
incoming = json.load(sys.stdin)
if set(incoming) != allowed or any(not str(incoming[key]).strip() for key in allowed):
    raise SystemExit("invalid service push environment payload")

with open(path, "r", encoding="utf-8") as source:
    lines = source.read().splitlines()

updated = []
seen = set()
for line in lines:
    key = line.split("=", 1)[0].strip() if "=" in line and not line.lstrip().startswith("#") else ""
    if key in allowed:
        updated.append(f"{key}={str(incoming[key]).strip()}")
        seen.add(key)
    else:
        updated.append(line)
for key in sorted(allowed - seen):
    updated.append(f"{key}={str(incoming[key]).strip()}")

directory = os.path.dirname(path)
descriptor, temporary = tempfile.mkstemp(prefix=".env.service-push.", dir=directory, text=True)
try:
    with os.fdopen(descriptor, "w", encoding="utf-8") as target:
        target.write("\n".join(updated) + "\n")
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
