// The app sets mongoose sanitizeFilter globally, which rewrites any { $in },
// { $exists } etc. in a filter into { $eq: {...} } unless marked trusted.
// That caused a 500 when adding hybrid groups (1 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { inIds, isSet } from "../src/utils/mongoSafety.ts";

test("inIds survives sanitizeFilter", () => {
  const filter = mongoose.sanitizeFilter({ _id: inIds(["a", "b"]) });
  assert.deepEqual(JSON.parse(JSON.stringify(filter)), { _id: { $in: ["a", "b"] } });
});

test("isSet survives sanitizeFilter", () => {
  const filter = mongoose.sanitizeFilter({ hybrid: isSet() });
  assert.deepEqual(JSON.parse(JSON.stringify(filter)), { hybrid: { $exists: true, $ne: null } });
});

test("an untrusted operator is still neutralised (the protection stays on)", () => {
  const filter = mongoose.sanitizeFilter({ _id: { $in: ["a"] } } as any);
  assert.deepEqual(JSON.parse(JSON.stringify(filter)), { _id: { $eq: { $in: ["a"] } } });
});

// Raw operator filters that still exist in older routes. They silently match
// nothing today; each needs an owner check before it is switched on, so they
// are fixed in the access audit (hub CL-051), not blindly. Don't add to this.
const KNOWN_OLD = new Map<string, number>([
  ["projects.ts", 2],
  ["financialModels.ts", 3],
  ["areas.ts", 1],
]);

test("no new raw $in / $exists / $ne filters in routes", async () => {
  const fs = await import("node:fs");
  const dir = new URL("../src/routes/", import.meta.url);
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(new URL(f, dir), "utf8");
    // find/findOne/deleteMany/count filters; aggregate $match is not sanitised
    const hits = (src.match(/\.(find|findOne|deleteMany|deleteOne|updateMany|countDocuments)\(\{[^)]*?\{\s*\$(in|exists|ne)\s*:/gs) ?? []).length;
    assert.ok(hits <= (KNOWN_OLD.get(f) ?? 0), `${f}: ${hits} raw operator filter(s); use inIds()/isSet()`);
  }
});
