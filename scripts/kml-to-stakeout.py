#!/usr/bin/env python3
"""Convert a RegenWorks "Export trees as KML" file into RTK stake-out files.

RegenWorks exports every tree as a KML placemark named after its species, with
longitude/latitude in full precision but no tree ID. GNSS controllers (Trimble
Access, Trimble Siteworks, Emlid Flow, ...) work best with projected grid
coordinates and a unique point name per tree, so this script:

  * reads the trees in export order (row by row, tree by tree),
  * projects them from ETRS89 lon/lat to ETRS89 / UTM zone 32N (EPSG:25832),
    the Danish standard grid, with millimetre precision,
  * splits them into rows and names each tree <prefix>R<row>T<tree>,
    e.g. BR03T017 = site B, row 3, tree 17,
  * writes files a controller can import directly.

Outputs (next to the input, or in --out-dir):
  <name>_trees_NENZ.csv  Name,Easting,Northing,Elevation,Code  (no header)
                         = Trimble "CSV Grid points E-N" format
  <name>_rows_NENZ.csv   start (S) and end (E) point of each row, same format,
                         for "Stakeout > Lines > Two points" line staking
  <name>.dxf             points, labels and row lines (layers per species)
  <name>_check.kml       named trees for a sanity check in Google Earth
  <name>_summary.txt     rows, trees, species, spacing and accuracy checks

Usage:
  pip install pyproj
  python3 kml-to-stakeout.py design.kml --prefix B
"""

from __future__ import annotations

import argparse
import math
import statistics
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

try:
    from pyproj import Transformer
except ImportError:  # pragma: no cover
    sys.exit("pyproj is required: pip install pyproj")

KML_NS = "{http://www.opengis.net/kml/2.2}"
SRC_CRS = "EPSG:4258"  # ETRS89 geographic (lon/lat)
DST_CRS = "EPSG:25832"  # ETRS89 / UTM zone 32N


@dataclass
class Tree:
    species: str
    latin: str
    lon: float
    lat: float
    e: float = 0.0
    n: float = 0.0
    row: int = 0
    idx: int = 0
    name: str = ""


def read_kml(path: Path) -> list[Tree]:
    root = ET.parse(path).getroot()
    trees: list[Tree] = []
    for pm in root.iter(f"{KML_NS}Placemark"):
        coords = pm.find(f".//{KML_NS}Point/{KML_NS}coordinates")
        if coords is None or not (coords.text or "").strip():
            continue  # strips/polygons are not trees
        lon, lat, *_ = (float(v) for v in coords.text.strip().split(","))
        trees.append(
            Tree(
                species=(pm.findtext(f"{KML_NS}name") or "Tree").strip(),
                latin=(pm.findtext(f"{KML_NS}description") or "").strip(),
                lon=lon,
                lat=lat,
            )
        )
    return trees


def dist(a: Tree, b: Tree) -> float:
    return math.hypot(a.e - b.e, a.n - b.n)


def offset_from_line(p: Tree, a: Tree, b: Tree) -> float:
    """Perpendicular distance from p to the line through a and b."""
    length = dist(a, b)
    if length == 0:
        return dist(p, a)
    return abs((b.e - a.e) * (a.n - p.n) - (a.e - p.e) * (b.n - a.n)) / length


def assign_rows(trees: list[Tree], max_offset: float, gap_factor: float) -> float:
    """Split trees (in export order) into rows. Returns the median spacing."""
    steps = [dist(a, b) for a, b in zip(trees, trees[1:])]
    median = statistics.median(steps) if steps else 0.0
    max_gap = gap_factor * median
    row, idx, start = 1, 0, 0
    for i, t in enumerate(trees):
        if i > 0:
            prev = trees[i - 1]
            new_row = dist(prev, t) > max_gap
            if not new_row and i - start >= 2:
                new_row = offset_from_line(t, trees[start], prev) > max_offset
            if new_row:
                row, idx, start = row + 1, 0, i
        idx += 1
        t.row, t.idx = row, idx
    return median


def fmt(v: float) -> str:
    return f"{v:.3f}"


def write_dxf(path: Path, trees: list[Tree], rows: dict[int, list[Tree]]) -> None:
    def layer(name: str) -> str:
        return "".join(c if c.isalnum() else "_" for c in name)[:31] or "TREES"

    out = ["0", "SECTION", "2", "ENTITIES"]
    for t in trees:
        lyr = layer(t.species)
        out += ["0", "POINT", "8", lyr, "10", fmt(t.e), "20", fmt(t.n), "30", "0.0"]
        out += ["0", "TEXT", "8", f"{lyr}_LABEL", "10", fmt(t.e + 0.2), "20", fmt(t.n + 0.2),
                "30", "0.0", "40", "0.3", "1", t.name]
    for r, rt in rows.items():
        a, b = rt[0], rt[-1]
        out += ["0", "LINE", "8", "ROWS", "10", fmt(a.e), "20", fmt(a.n), "30", "0.0",
                "11", fmt(b.e), "21", fmt(b.n), "31", "0.0"]
    out += ["0", "ENDSEC", "0", "EOF"]
    path.write_text("\n".join(out) + "\n", encoding="ascii", errors="replace")


def write_check_kml(path: Path, trees: list[Tree]) -> None:
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>']
    for t in trees:
        parts.append(
            f"<Placemark><name>{t.name}</name><description>{escape(t.species)}</description>"
            f"<Point><coordinates>{t.lon:.9f},{t.lat:.9f},0</coordinates></Point></Placemark>"
        )
    parts.append("</Document></kml>")
    path.write_text("\n".join(parts), encoding="utf-8")


def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kml", type=Path)
    ap.add_argument("--prefix", default="", help="site letter(s) in front of every point name, e.g. B")
    ap.add_argument("--out-dir", type=Path)
    ap.add_argument("--max-offset", type=float, default=0.5,
                    help="metres a tree may sit off its row line before a new row starts (default 0.5)")
    ap.add_argument("--gap-factor", type=float, default=4.0,
                    help="a step longer than this many times the median spacing starts a new row (default 4)")
    ap.add_argument("--null-elevation", default="",
                    help="value written in the elevation column (default empty; use -99999 if the controller needs a number)")
    args = ap.parse_args()

    trees = read_kml(args.kml)
    if not trees:
        sys.exit(f"No tree points found in {args.kml}")

    fwd = Transformer.from_crs(SRC_CRS, DST_CRS, always_xy=True)
    inv = Transformer.from_crs(DST_CRS, SRC_CRS, always_xy=True)
    for t in trees:
        t.e, t.n = fwd.transform(t.lon, t.lat)

    median = assign_rows(trees, args.max_offset, args.gap_factor)
    rows: dict[int, list[Tree]] = {}
    for t in trees:
        t.name = f"{args.prefix}R{t.row:02d}T{t.idx:03d}"
        rows.setdefault(t.row, []).append(t)

    # Round-trip check: the rounded grid coordinates must land on the design point.
    worst = 0.0
    for t in trees:
        lon, lat = inv.transform(round(t.e, 3), round(t.n, 3))
        worst = max(worst, math.hypot((lon - t.lon) * 111320 * math.cos(math.radians(t.lat)), (lat - t.lat) * 110574))

    out_dir = args.out_dir or args.kml.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = args.kml.stem.replace(" ", "_")
    z = args.null_elevation

    trees_csv = out_dir / f"{stem}_trees_NENZ.csv"
    trees_csv.write_text("".join(f"{t.name},{fmt(t.e)},{fmt(t.n)},{z},{t.species}\n" for t in trees), encoding="utf-8")

    rows_csv = out_dir / f"{stem}_rows_NENZ.csv"
    with rows_csv.open("w", encoding="utf-8") as f:
        for r, rt in rows.items():
            f.write(f"{args.prefix}R{r:02d}S,{fmt(rt[0].e)},{fmt(rt[0].n)},{z},row start\n")
            f.write(f"{args.prefix}R{r:02d}E,{fmt(rt[-1].e)},{fmt(rt[-1].n)},{z},row end\n")

    write_dxf(out_dir / f"{stem}.dxf", trees, rows)
    write_check_kml(out_dir / f"{stem}_check.kml", trees)

    lines = [
        f"Source: {args.kml.name}",
        f"Grid: ETRS89 / UTM zone 32N (EPSG:25832), metres, 3 decimals (1 mm)",
        f"Trees: {len(trees)}   Rows: {len(rows)}   Median spacing: {median:.2f} m",
        f"Projection round-trip error (worst tree): {worst * 1000:.2f} mm",
        "",
        "Species:",
        *(f"  {s}: {c}" for s, c in Counter(t.species for t in trees).most_common()),
        "",
        "Rows (trees, length, straightness = max offset from start-end line):",
    ]
    for r, rt in rows.items():
        length = dist(rt[0], rt[-1])
        bend = max((offset_from_line(t, rt[0], rt[-1]) for t in rt), default=0.0)
        steps = [dist(a, b) for a, b in zip(rt, rt[1:])]
        sp = f"{min(steps):.2f}-{max(steps):.2f} m" if steps else "-"
        lines.append(f"  R{r:02d}: {len(rt):4d} trees  {length:7.2f} m  spacing {sp}  offset {bend * 1000:.0f} mm")
    (out_dir / f"{stem}_summary.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:4]))
    print(f"Wrote {trees_csv.name}, {rows_csv.name}, {stem}.dxf, {stem}_check.kml, {stem}_summary.txt to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
