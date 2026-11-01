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

test("new routes don't use raw $in / $exists filters", async () => {
  const fs = await import("node:fs");
  for (const f of ["catalogue.ts", "systemdesigns.ts", "userpresets.ts"]) {
    const src = fs.readFileSync(new URL(`../src/routes/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\{\s*\$(in|exists|ne)\s*:/, `${f} has a raw operator filter`);
  }
});
