"""Convert the golden-label workbook into a SQL seed for Supabase.

Uses only Python's standard library. The generated SQL contains the source
sentences and golden labels and must stay out of the public website repository.
"""

import argparse
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS = {"m": MAIN_NS}
REQUIRED = {
    "sentence",
    "golden_agency_presence",
    "golden_agency_high_low",
    "golden_inevitability_presence",
    "golden_inevitability_high_low",
}


def col_index(cell_ref):
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    result = 0
    for char in letters:
        result = result * 26 + ord(char) - ord("A") + 1
    return result - 1


def cell_value(cell, strings):
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return "".join(part.text or "" for part in cell.findall(".//m:t", NS))
    value = cell.findtext("m:v", default="", namespaces=NS)
    if kind == "s" and value:
        return strings[int(value)]
    return value


def read_workbook(path):
    with zipfile.ZipFile(path) as book:
        strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            shared = ET.fromstring(book.read("xl/sharedStrings.xml"))
            strings = [
                "".join(part.text or "" for part in item.findall(".//m:t", NS))
                for item in shared.findall("m:si", NS)
            ]
        sheet_names = sorted(
            (name for name in book.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name)),
            key=lambda name: int(re.search(r"sheet(\d+)", name).group(1)),
        )
        if not sheet_names:
            raise ValueError("Workbook has no worksheets")
        sheet = ET.fromstring(book.read(sheet_names[0]))
        rows = []
        for row in sheet.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                values[col_index(cell.attrib["r"])] = cell_value(cell, strings)
            if values:
                rows.append([values.get(index, "") for index in range(max(values) + 1)])
        if not rows:
            raise ValueError("First worksheet is empty")
        headers = [str(value).strip() for value in rows[0]]
        missing = REQUIRED - set(headers)
        if missing:
            raise ValueError(f"Missing columns: {', '.join(sorted(missing))}")
        records = []
        for row_number, values in enumerate(rows[1:], start=2):
            record = {header: values[i] if i < len(values) else "" for i, header in enumerate(headers)}
            if str(record.get("sentence", "")).strip():
                records.append((str(row_number), record))
        return records


def sql_quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def jsonb(value):
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return sql_quote(payload) + "::jsonb"


def main():
    parser = argparse.ArgumentParser(description="Generate the Supabase source_dataset SQL seed from the golden-label workbook.")
    parser.add_argument("workbook", type=Path, help="Path to AI_label_second_round_golden_label.xlsx")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "seed_source_dataset.sql")
    args = parser.parse_args()

    records = read_workbook(args.workbook)
    lines = [
        "-- Generated from the golden-label workbook. Keep this file private and do not commit it.",
        "insert into public.source_dataset(external_id,sentence,golden_labels,source_data) values",
    ]
    values = []
    for external_id, record in records:
        values.append(
            "(" + ",".join([
                sql_quote(external_id),
                sql_quote(record["sentence"]),
                jsonb(record),
                jsonb(record),
            ]) + ")"
        )
    lines.append(",\n".join(values))
    lines.append(
        "on conflict (external_id) do update set sentence=excluded.sentence, "
        "golden_labels=excluded.golden_labels, source_data=excluded.source_data;"
    )
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Generated {args.output} with {len(records)} source rows")


if __name__ == "__main__":
    main()
