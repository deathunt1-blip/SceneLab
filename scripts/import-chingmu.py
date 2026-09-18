"""Extract the supplied catalog without replacing blanks or changing source values."""
import hashlib
import json
from pathlib import Path
import sys
import openpyxl

source = Path(sys.argv[1])
workbook = openpyxl.load_workbook(source, data_only=True, read_only=True)
tables = {}
for sheet in workbook:
    rows = list(sheet.values)
    tables[sheet.title] = [
        {key: value for key, value in zip(rows[0], row) if key is not None}
        for row in rows[1:] if any(value is not None for value in row)
    ]
output = Path(__file__).resolve().parents[1] / "src/camera/data/chingmu-v1.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({
    "dataset": "chingmu-v1.0",
    "filename": source.name,
    "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "tables": tables,
}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({key: len(value) for key, value in tables.items()}))
