#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz  # PyMuPDF


def html_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Benchmark PyMuPDF table extraction on selected PDF pages and generate JSON + HTML review."
    )
    parser.add_argument("--pdf", required=True, help="Path to source PDF.")
    parser.add_argument("--out-dir", required=True, help="Output directory.")
    parser.add_argument("--pages", required=True, help="Page list or range. Examples: 91-95 or 91,92,95")
    parser.add_argument("--dpi", type=int, default=180, help="PNG render dpi (default: 180).")
    parser.add_argument("--max-rows", type=int, default=120, help="Max rows shown per table in HTML (default: 120).")
    return parser


def parse_pages(spec: str) -> list[int]:
    spec = spec.strip()
    if "," in spec:
        pages = [int(part.strip()) for part in spec.split(",") if part.strip()]
    elif "-" in spec:
        start, end = spec.split("-", 1)
        s, e = int(start.strip()), int(end.strip())
        pages = list(range(min(s, e), max(s, e) + 1))
    else:
        pages = [int(spec)]
    return sorted(set(pages))


def main() -> int:
    args = build_parser().parse_args()

    pdf_path = Path(args.pdf)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    img_dir = out_dir / "images"
    img_dir.mkdir(parents=True, exist_ok=True)

    pages = parse_pages(args.pages)
    if not pages:
        raise ValueError("No pages requested.")

    doc = fitz.open(pdf_path)
    records = []

    for p in pages:
        page = doc[p - 1]
        image_path = img_dir / f"page_{p:04d}.png"
        page.get_pixmap(dpi=args.dpi).save(image_path)

        finder = page.find_tables()
        page_rec = {"page": p, "table_count": len(finder.tables), "tables": []}

        for ti, table in enumerate(finder.tables, 1):
            extracted = table.extract()
            header_names = []
            if table.header is not None and table.header.names is not None:
                header_names = [h if h is not None else "" for h in table.header.names]
            page_rec["tables"].append(
                {
                    "table_index": ti,
                    "bbox": list(table.bbox),
                    "row_count": table.row_count,
                    "col_count": table.col_count,
                    "header": header_names,
                    "rows": extracted,
                }
            )
        records.append(page_rec)

    pages_label = "_".join(str(p) for p in pages)
    json_path = out_dir / f"tables_pages_{pages_label}.json"
    json_path.write_text(json.dumps(records, indent=2), encoding="utf-8")

    cards = []
    for rec in records:
        table_blocks = []
        for table in rec["tables"]:
            cols = table["col_count"]
            header = table["header"] if table["header"] else [""] * cols
            header_html = "".join(f"<th>{html_escape(str(h or ''))}</th>" for h in header)

            body_rows = []
            for row in table["rows"][: args.max_rows]:
                cells = (row + [""] * cols)[:cols]
                row_html = "".join(f"<td>{html_escape(str(c or ''))}</td>" for c in cells)
                body_rows.append(f"<tr>{row_html}</tr>")

            table_blocks.append(
                f"""
<div class="tablebox">
  <p><b>table {table['table_index']}</b> rows={table['row_count']} cols={table['col_count']} bbox={table['bbox']}</p>
  <div class="scroll">
    <table>
      <thead><tr>{header_html}</tr></thead>
      <tbody>{''.join(body_rows)}</tbody>
    </table>
  </div>
</div>
"""
            )

        cards.append(
            f"""
<section>
  <h2>Page {rec['page']}</h2>
  <img src="images/page_{rec['page']:04d}.png" alt="page {rec['page']}" />
  {''.join(table_blocks)}
</section>
"""
        )

    html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PyMuPDF Table Benchmark</title>
  <style>
    body {{ font-family: Segoe UI, Arial, sans-serif; margin: 16px; color: #1a1a1a; }}
    section {{ border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 16px 0; }}
    img {{ width: 100%; max-width: 1100px; border: 1px solid #ddd; border-radius: 6px; }}
    .tablebox {{ margin-top: 10px; }}
    .scroll {{ overflow: auto; border: 1px solid #ddd; border-radius: 6px; }}
    table {{ border-collapse: collapse; min-width: 1200px; }}
    th, td {{ border: 1px solid #ddd; padding: 4px 6px; vertical-align: top; white-space: pre-wrap; }}
    th {{ background: #f3f6fa; position: sticky; top: 0; }}
  </style>
</head>
<body>
  <h1>PyMuPDF Table Extraction Benchmark</h1>
  <p>source={html_escape(str(pdf_path))} | pages={html_escape(args.pages)} | dpi={args.dpi}</p>
  {''.join(cards)}
</body>
</html>
"""

    html_path = out_dir / f"review_pages_{pages_label}.html"
    html_path.write_text(html, encoding="utf-8")

    print(f"Wrote {json_path}")
    print(f"Wrote {html_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
