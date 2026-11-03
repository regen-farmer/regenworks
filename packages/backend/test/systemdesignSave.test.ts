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
