// A design saved twice from the same page must not fail on its old version number.
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import SystemDesign from "@rw/db/schemas/systemdesign.ts";
import { designFields } from "../src/routes/systemdesigns.ts";

test("design save ignores the id, version and timestamps the page sends back", () => {
  assert.deepEqual(designFields({ _id: "x", __v: 2, createdAt: 1, updatedAt: 2, bearing: 5, rows: [] }), { bearing: 5, rows: [] });
  assert.deepEqual(designFields(null), {});
  assert.deepEqual(designFields([1]), {});
  // stored at version 3; the page still holds version 2 from before its last save
  const id = new mongoose.Types.ObjectId();
  const sp = new mongoose.Types.ObjectId();
  const d: any = SystemDesign.hydrate({ _id: id, __v: 3, rows: [{ sequence: [{ species: sp, spacingAfter: 2 }] }] });
  d.set(designFields({ _id: String(id), __v: 2, rows: [{ sequence: [{ species: String(sp), spacingAfter: 3 }] }] }));
  const [where] = d.$__delta();
  assert.equal(where.__v, 3, "the update looks for the stored version");
});

test("grid layout settings: checked on save, stored, and absent on old designs", async () => {
  const { cleanLayout } = await import("../src/routes/systemdesigns.ts");
  assert.deepEqual(cleanLayout(undefined), { ok: true, value: undefined });
  assert.deepEqual(cleanLayout({ mode: "rows" }), { ok: true, value: { mode: "rows" } });
  const ok: any = cleanLayout({
    mode: "grid",
    grid: { anchor: [10.6, 56.2], corner: "start-left", shiftAlong: "1.5", pattern: "offset", extent: { rows: 4.7 } },
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.grid.anchor, [10.6, 56.2]);
  assert.equal(ok.value.grid.shiftAlong, 1.5);
  assert.equal(ok.value.grid.extent.rows, 4);
  for (const bad of [
    { mode: "spiral" },
    { mode: "grid", grid: { anchor: [10.6] } },
    { mode: "grid", grid: { anchor: [500, 56] } },
    { mode: "grid", grid: { anchor: ["x", 56] } },
    { mode: "grid", grid: { corner: "middle" } },
    { mode: "grid", grid: { pattern: "hex" } },
    { mode: "grid", grid: { shiftAlong: Infinity } },
    { mode: "grid", grid: { extent: { length: -5 } } },
    "grid",
  ]) {
    assert.equal(cleanLayout(bad).ok, false, JSON.stringify(bad));
  }

  // Stored by the schema as sent; an old design has no layout at all.
  const d: any = new SystemDesign({ rows: [], layout: ok.value });
  assert.equal(d.validateSync(), undefined);
  assert.equal(d.layout.mode, "grid");
  assert.deepEqual([...d.layout.grid.anchor], [10.6, 56.2]);
  const old: any = SystemDesign.hydrate({ _id: new mongoose.Types.ObjectId(), rows: [] });
  assert.equal(old.toObject().layout?.mode, undefined);
});
