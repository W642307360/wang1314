#!/usr/bin/env python3
"""Compile a supplemental customer-service XLSX into the runtime JSON index.

The production database is never opened. Existing JSON entries are retained,
incoming exact-question duplicates replace the older wording, and the source
workbook itself is read-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
GROUPS = ["purchase", "order", "after_sale", "pet_health", "logistics", "official"]


def column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference).group(0)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def read_first_sheet(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si", NS):
                shared.append("".join(node.text or "" for node in item.iterfind(".//m:t", NS)))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        relation_map = {item.attrib["Id"]: item.attrib["Target"] for item in relationships}
        first = workbook.find("m:sheets/m:sheet", NS)
        relation_id = first.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = relation_map[relation_id].lstrip("/")
        if not target.startswith("xl/"):
            target = f"xl/{target}"
        sheet = ET.fromstring(archive.read(target))
        rows: list[list[str]] = []
        for row_node in sheet.findall("m:sheetData/m:row", NS):
            row: list[str] = []
            for cell in row_node.findall("m:c", NS):
                index = column_index(cell.attrib["r"])
                while len(row) <= index:
                    row.append("")
                cell_type = cell.attrib.get("t")
                if cell_type == "inlineStr":
                    value = "".join(node.text or "" for node in cell.iterfind(".//m:t", NS))
                else:
                    value_node = cell.find("m:v", NS)
                    raw = value_node.text if value_node is not None else ""
                    value = shared[int(raw)] if cell_type == "s" and raw else raw
                row[index] = value.strip()
            rows.append(row)
        return rows


def normalize_question(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)


def group_for_supplemental_ordinal(ordinal: int) -> str:
    if 1 <= ordinal <= 106:
        return "purchase"
    if 107 <= ordinal <= 190:
        return "official"
    if 191 <= ordinal <= 224 or 231 <= ordinal <= 250:
        return "after_sale"
    if 225 <= ordinal <= 230:
        return "pet_health"
    raise ValueError(f"unmapped supplemental intent ordinal: {ordinal}")


def source_records(base: dict, source: Path) -> list[dict[str, str]]:
    records = list(base.get("sources") or [])
    if not records and base.get("source_file") and base.get("source_sha256"):
        records.append({"file": base["source_file"], "sha256": base["source_sha256"]})
    records.append({"file": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest()})
    unique: dict[str, dict[str, str]] = {}
    for record in records:
        unique[record["sha256"]] = record
    return list(unique.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="supplemental XLSX workbook")
    parser.add_argument("output", type=Path, help="combined runtime JSON")
    parser.add_argument("--base-json", required=True, type=Path, help="current maintained corpus JSON")
    parser.add_argument("--version", default="2026-07-22.2")
    arguments = parser.parse_args()

    base = json.loads(arguments.base_json.read_text(encoding="utf-8"))
    rows = read_first_sheet(arguments.source)
    expected = ["编号", "意图类别", "用户问题", "关键词", "客服回复"]
    if rows[0][:5] != expected:
        raise ValueError(f"unexpected header: {rows[0][:5]}")

    categories: list[str] = []
    incoming: list[dict] = []
    for row in rows[1:]:
        padded = (row + [""] * 5)[:5]
        number, intent, question, keyword_text, reply = padded
        if not all(padded):
            raise ValueError(f"empty field in source row: {padded}")
        if intent not in categories:
            categories.append(intent)
        ordinal = categories.index(intent) + 1
        keywords = list(dict.fromkeys(
            keyword.strip() for keyword in re.split(r"[|｜，、]+", keyword_text) if keyword.strip()
        ))
        incoming.append({
            "id": int(float(number)),
            "intent": intent,
            "intent_ordinal": ordinal,
            "group": group_for_supplemental_ordinal(ordinal),
            "question": question,
            "keywords": keywords,
            "reply": reply,
        })

    if len(incoming) != 2500 or len(categories) != 250:
        raise ValueError(f"expected 2500 rows and 250 intents, got {len(incoming)} and {len(categories)}")

    combined: dict[str, dict] = {}
    for entry in base.get("entries", []):
        combined[normalize_question(entry["question"])] = dict(entry)
    replaced = 0
    for entry in incoming:
        key = normalize_question(entry["question"])
        replaced += int(key in combined)
        combined[key] = entry
    entries = list(combined.values())
    for index, entry in enumerate(entries, start=1):
        entry["id"] = index

    intents = {(entry["group"], entry["intent"]) for entry in entries}
    sources = source_records(base, arguments.source)
    combined_hash = hashlib.sha256("|".join(record["sha256"] for record in sources).encode()).hexdigest()
    payload = {
        "version": arguments.version,
        "source_file": "+".join(record["file"] for record in sources),
        "source_sha256": combined_hash,
        "sources": sources,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "entry_count": len(entries),
        "intent_count": len(intents),
        "incoming_entry_count": len(incoming),
        "duplicate_questions_replaced": replaced,
        "groups": GROUPS,
        "entries": entries,
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({key: payload[key] for key in (
        "version", "source_sha256", "entry_count", "intent_count",
        "incoming_entry_count", "duplicate_questions_replaced",
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
