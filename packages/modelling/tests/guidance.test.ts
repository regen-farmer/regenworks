// Guidance lines for auto-steer: one line per row, ISOXML v4 and shapefile.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTurfJsLayout } from "../layout-backends/turf-js.ts";
import { stakeoutTrees } from "../planting/stakeout.ts";
import { guidanceFiles, guidanceLines, isoxmlTaskdata } from "../planting/guidance.ts";
import { toUtm32 } from "../planting/utm.ts";
import { zipTextFiles } from "../planting/zip.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "apple-trees", "input.json"), "utf8"));
const labelOf = (_t: any) => ({ species: "x", label: "x" });
const BOUNDARY = (typeof input.fieldGeometry === "string" ? JSON.parse(input.fieldGeometry) : input.fieldGeometry).geometry;

async function rows() {
  const { layout } = await runTurfJsLayout({ systemDesign: input.systemDesign, fieldGeometry: input.fieldGeometry });
  return stakeoutTrees(layout, { prefix: "B", labelOf });
}

test("one straight AB line per row, through the first and last tree, extended at both ends", async () => {
  const r = await rows();
  const lines = guidanceLines(r, { prefix: "B", extendM: 5 });
  assert.equal(lines.length, r.filter((x) => x.trees.length >= 2).length);
  for (const [i, l] of lines.entries()) {
    const row = r.find((x) => x.row === l.row)!;
    assert.equal(l.kind, "AB");
    assert.equal(l.points.length, 2);
    assert.match(l.name, /^BR\d{2,}$/);
    const a = toUtm32(l.points[0].lon, l.points[0].lat);
    const t0 = row.trees[0];
    assert.ok(Math.abs(Math.hypot(a.e - t0.e, a.n - t0.n) - 5) < 0.01, `row ${i}: 5 m before the first tree`);
    const tl = row.trees[row.trees.length - 1];
    assert.ok(Math.abs(l.lengthM - (Math.hypot(tl.e - t0.e, tl.n - t0.n) + 10)) < 0.01);
  }
});

test("a bending row becomes a curve through every tree", () => {
  const mk = (e: number, n: number, i: number) => ({ name: `R01T${i}`, row: 1, tree: i, e, n, lon: 0, lat: 0, label: "", species: "" });
  const bent = [{ row: 1, trees: [mk(500000, 6200000, 1), mk(500010, 6200001, 2), mk(500020, 6200000, 3)] }];
  const [l] = guidanceLines(bent as any, { extendM: 0 });
  assert.equal(l.kind, "CURVE");
  assert.equal(l.points.length, 5);
});

test("ISOXML: v4 partfield with the boundary and a guidance pattern per row, points A ... B", async () => {
  const r = await rows();
  const lines = guidanceLines(r, { prefix: "B" });
  const x = isoxmlTaskdata(lines, { name: "Mark <1> & co", boundary: BOUNDARY });
  assert.match(x, /<ISO11783_TaskData VersionMajor="4" VersionMinor="2"/);
  assert.match(x, /<PFD A="PFD1" C="Mark &lt;1&gt; &amp; co" D="\d+">/);
  assert.match(x, /<PLN A="1"[^>]*><LSG A="1"><PNT A="2"/);
  assert.equal((x.match(/<GPN /g) ?? []).length, lines.length);
  assert.equal((x.match(/<PNT A="6"/g) ?? []).length, lines.length);
  assert.equal((x.match(/<PNT A="7"/g) ?? []).length, lines.length);
  assert.match(x, /<GPN A="GPN1" B="BR\d+" C="1" E="4" F="1" I="16"><LSG A="5"/);
  // latitude in C, longitude in D (Denmark: lat ~ 55-57)
  const c = Number(/<PNT A="6" C="([\d.]+)" D="([\d.]+)"/.exec(x)![1]);
  assert.ok(c > 40 && c < 70);
});

test("shapefile: valid headers, one polyline record per row, dbf rows, WGS84 .prj; zip keeps folders and bytes", async () => {
  const r = await rows();
  const g = guidanceFiles(r, { name: "Mark 1", boundary: BOUNDARY }, "Field 1 - Plan A", { prefix: "B" });
  const shp = g.files["Shapefile/Field_1_-_Plan_A_guidance_lines.shp"] as Uint8Array;
  const shx = g.files["Shapefile/Field_1_-_Plan_A_guidance_lines.shx"] as Uint8Array;
  const dbf = g.files["Shapefile/Field_1_-_Plan_A_guidance_lines.dbf"] as Uint8Array;
  const v = new DataView(shp.buffer);
  assert.equal(v.getInt32(0, false), 9994);
  assert.equal(v.getInt32(24, false) * 2, shp.length);
  assert.equal(v.getInt32(32, true), 3);
  assert.equal((shx.length - 100) / 8, g.lines.length);
  assert.equal(new DataView(dbf.buffer).getUint32(4, true), g.lines.length);
  assert.match(String(g.files["Shapefile/Field_1_-_Plan_A_guidance_lines.prj"]), /WGS_1984/);
  assert.ok(g.files["Shapefile/Field_1_-_Plan_A_boundary.shp"] instanceof Uint8Array);
  assert.ok(String(g.files["TASKDATA/TASKDATA.XML"]).includes("<GGP"));
  const zip = zipTextFiles(g.files);
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
  assert.ok(Buffer.from(zip).includes(Buffer.from("TASKDATA/TASKDATA.XML")));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guidance-"));
  for (const [k, val] of Object.entries(g.files)) {
    const p = path.join(dir, k);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, val);
  }
});
