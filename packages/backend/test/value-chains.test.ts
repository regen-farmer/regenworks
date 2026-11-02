// Library → Value chains: equipment import and line checks, route access. Made-up numbers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanLines, parseEquipmentCsv, safeUrl } from "../src/internal/valueChains.ts";
import internalRoutes from "../src/routes/internal.ts";

const HEADER = "equipment_id,category,name,maker,model,crops,input_form,output_forms,mode,cap_low,cap_high,cap_unit,batch_hours_low,batch_hours_high,power_kw,price_low,price_high,currency,price_vat,price_basis,observed_date,source_title,source_url,notes";
const row = (over: Partial<Record<string, string>> = {}) => {
  const r: Record<string, string> = {
    equipment_id: "dry-1", category: "dry", name: "Test dryer", maker: "", model: "", crops: "hazel;walnut;banana", input_form: "wet-in-shell", output_forms: "dried-in-shell",
    mode: "batch", cap_low: "100", cap_high: "200", cap_unit: "kg/batch", batch_hours_low: "24", batch_hours_high: "48", power_kw: "", price_low: "10", price_high: "20",
    currency: "EUR", price_vat: "excl", price_basis: "new", observed_date: "2026-11-02", source_title: "A shop", source_url: "https://example.com/dryer", notes: "",
    ...over,
  };
  return HEADER.split(",").map((k) => (r[k].includes(",") ? `"${r[k]}"` : r[k])).join(",");
};

test("equipment.csv: parsed with numbers, unknown crops dropped", () => {
  const r = parseEquipmentCsv(`${HEADER}\n${row()}\n`);
  assert.ok(r.ok);
  const it = (r as any).value[0];
  assert.equal(it.capHigh, 200);
  assert.equal(it.batchHoursLow, 24);
  assert.deepEqual(it.crops, ["hazel", "walnut"]);
  assert.equal(it.sourceUrl, "https://example.com/dryer");
});

test("equipment.csv: a bad row refuses the whole file", () => {
  assert.equal(parseEquipmentCsv(`${HEADER}\n${row({ category: "teleport" })}`).ok, false);
  assert.equal(parseEquipmentCsv(`${HEADER}\n${row({ cap_high: "lots" })}`).ok, false);
  assert.equal(parseEquipmentCsv(`${HEADER}\n${row({ price_low: "-5" })}`).ok, false);
  assert.equal(parseEquipmentCsv(`${HEADER}\n${row()}\n${row()}`).ok, false, "duplicate id");
  assert.equal(parseEquipmentCsv("equipment_id,name\nx,y").ok, false, "missing columns");
  assert.equal(parseEquipmentCsv(HEADER).ok, false, "no rows");
});

test("only http(s) source links are kept", () => {
  assert.equal(safeUrl("javascript:alert(1)"), undefined);
  assert.equal(safeUrl("https://x.dk/a b"), undefined);
  assert.equal(safeUrl("http://x.dk/a"), "http://x.dk/a");
  const r = parseEquipmentCsv(`${HEADER}\n${row({ source_url: "javascript:alert(1)" })}`);
  assert.equal((r as any).value[0].sourceUrl, undefined);
});

const line = () => ({
  id: "line-1",
  name: "Hazel",
  nodes: [
    { id: "in", kind: "input", label: "Hazel", x: 10, y: 20, crop: "hazel", kg: 1000, weekFrom: 36, weekTo: 40, extra: "dropped" },
    { id: "m", kind: "machine", label: "Dryer", mode: "batch", kgPerBatch: 500, batchHours: 24, hoursPerDay: 99, daysPerWeek: 7, loss: 2 },
    { id: "o", kind: "output", label: "Sale" },
  ],
  edges: [
    { id: "e1", from: "in", to: "m" },
    { id: "e2", from: "m", to: "o", share: 0.5 },
  ],
});

test("lines: known fields only, values clamped or dropped", () => {
  const r = cleanLines({ lines: [line()] });
  assert.ok(r.ok);
  const [l] = (r as any).value;
  assert.equal(l.nodes[0].extra, undefined);
  assert.equal(l.nodes[1].hoursPerDay, 8, "out of range -> default");
  assert.equal(l.nodes[1].loss, 0, "loss above 1 -> 0");
  assert.equal(l.edges[1].share, 0.5);
});

test("lines: refused when ids clash, arrows dangle, crops or kinds are unknown", () => {
  const dangling = line();
  dangling.edges.push({ id: "e3", from: "m", to: "nowhere" });
  assert.equal(cleanLines({ lines: [dangling] }).ok, false);
  const crop = line();
  (crop.nodes[0] as any).crop = "banana";
  assert.equal(cleanLines({ lines: [crop] }).ok, false);
  const kind = line();
  (kind.nodes[2] as any).kind = "script";
  assert.equal(cleanLines({ lines: [kind] }).ok, false);
  const twice = line();
  twice.nodes.push({ ...twice.nodes[2] });
  assert.equal(cleanLines({ lines: [twice] }).ok, false);
  assert.equal(cleanLines({ lines: [{ ...line(), id: "bad id!" }] }).ok, false);
  assert.equal(cleanLines({ lines: "x" }).ok, false);
});

let who: any = {};
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
app.use("/internal", internalRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test("/internal/value-chains: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    const json = { headers: { "content-type": "application/json" }, body: "{}" };
    assert.equal((await fetch(`${base}/internal/value-chains`)).status, status);
    assert.equal((await fetch(`${base}/internal/value-chains/catalogue`, { method: "PUT", ...json })).status, status);
    assert.equal((await fetch(`${base}/internal/value-chains/lines/x`, { method: "PUT", ...json })).status, status);
    assert.equal((await fetch(`${base}/internal/value-chains/lines/x`, { method: "DELETE" })).status, status);
  }
});
