import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { buildAssumptions, cleanScenario, maxRowSpacing, toAssumptions } from "../src/internal/economics.ts";
import internalRoutes from "../src/routes/internal.ts";

const RANGES = `parameter,crop_id,age,unit,n_values,n_sources,low,likely,high,danish_likely,sources,value_ids,note
yield_full,hazel,,kg/plant/yr,1,1,1.0,2.0,3.0,2.0,src,a-1,
yield_at_age,hazel,4,kg/plant/yr,2,2,0.1,0.2,0.3,0.2,src,a-2,
opportunity_cost,,,kr/ha/yr,1,1,1000,1500,2000,1500,test,a-3,
`;
const PAY = `payment_id,scheme,scheme_da,year,rate,currency,unit,stackable_with,eligibility,source_id,source_detail,notes
gb-2026,basic income support,Grundbetaling,2026,211.23,EUR,per eligible ha,all,"Eligible area, with a comma",bek,§ 38,
`;
const FB = `crop_da,crop_id,latin,min_plants_per_ha,grafted_required,source_id,source_detail
Hasselnød,hazel,Corylus,225,no,bek,§ 16
Rabarber,,Rheum,1000,no,bek,§ 16
`;

test("buildAssumptions: Grove Data's files become one version; ages, payments and rules typed", () => {
  const b = buildAssumptions({ "assumption_ranges.csv": RANGES, "area_payments.csv": PAY, "frugt_baer_rules.csv": FB });
  assert.ok(b.ok, JSON.stringify(b));
  if (!b.ok) return;
  assert.equal(b.data.ranges.length, 3);
  assert.equal(b.data.ranges[0].age, null);
  assert.equal(b.data.ranges[1].age, 4);
  assert.equal(b.data.payments[0].rate, 211.23);
  assert.equal(b.data.fruitBerry.length, 1, "a crop without a crop id is left out");
  const a = toAssumptions({ version: 2, ...b.data }, null);
  assert.equal(a.eurDkk, 7.46);
  assert.equal(a.ranges[0].age, null);
});

test("buildAssumptions: a broken file changes nothing", () => {
  assert.equal(buildAssumptions({ "area_payments.csv": PAY }).ok, false);
  const bad = buildAssumptions({ "assumption_ranges.csv": RANGES.replace("1.0,2.0,3.0", "x,2.0,3.0"), "area_payments.csv": PAY });
  assert.ok(!bad.ok && bad.errors[0].includes("row 2"));
  const noCol = buildAssumptions({ "assumption_ranges.csv": "parameter,crop_id\nprice,hazel\n", "area_payments.csv": PAY });
  assert.ok(!noCol.ok && /missing column/.test(noCol.errors.join()));
  const eurx = buildAssumptions({ "assumption_ranges.csv": RANGES, "area_payments.csv": PAY.replace(",EUR,", ",USD,") });
  assert.equal(eurx.ok, false);
});

test("cleanScenario: known keys, numbers in range, bands ordered, nothing else", () => {
  const c = cleanScenario({
    name: "  Test farm, plan A ",
    farm: "0123456789abcdef01234567",
    fields: [{ layer: "0123456789abcdef01234568", scenario: "0123456789abcdef01234569", plantingYear: 2027 }],
    crops: [{ crop_id: "hazel", price: { low: 30, likely: 40, high: 60 }, processingLoss: 0.4, form: "in-shell", hack: 1 }],
    establishment: { plantingPerPlant: "12", protectionPerPlant: null },
    baseline: { landUse: "grazing", organic: true, paymentsToday: ["gb-2026", "gb-2026", "$where"], opportunityPerHa: { low: 2000, likely: 3000, high: 4000 } },
    createdBy: "x",
    assumptionsVersion: 9,
  });
  assert.ok(c.ok);
  if (!c.ok) return;
  assert.equal(c.value.name, "Test farm, plan A");
  assert.equal((c.value.crops as any)[0].hack, undefined);
  assert.deepEqual((c.value.establishment as any), { plantingPerPlant: 12, protectionPerPlant: null });
  assert.deepEqual((c.value.baseline as any).paymentsToday, ["gb-2026"]);
  assert.equal((c.value as any).createdBy, undefined);
  assert.equal((c.value as any).assumptionsVersion, undefined, "set only through the route's own check");
  assert.equal(cleanScenario({ name: "" }).ok, false);
  assert.equal(cleanScenario({ farm: { $ne: null } }).ok, false);
  assert.equal(cleanScenario({ crops: [{ crop_id: "hazel", price: { low: 50, likely: 40, high: 60 } }] }).ok, false);
  assert.equal(cleanScenario({ fields: [{ layer: "0123456789abcdef01234568" }, { layer: "0123456789abcdef01234568" }] }).ok, false);
  assert.equal(cleanScenario({ crops: [{ crop_id: "hazel", replacementRate: 2 }] }).ok, false);
  assert.equal(cleanScenario({ horizonYears: 100 }).ok, false);
  // an empty band (as stored for "use the assumptions") is no band, not an error
  const empty = cleanScenario({ baseline: { organic: false, paymentsToday: [], opportunityPerHa: {} } });
  assert.ok(empty.ok && (empty.value.baseline as any).opportunityPerHa === null);
  const blank = cleanScenario({ crops: [{ crop_id: "hazel", price: { low: null, likely: null, high: null } }] });
  assert.ok(blank.ok && (blank.value.crops as any)[0].price === null);
});

test("maxRowSpacing: centre to centre between neighbouring rows; offsets run along the row and don't count", () => {
  assert.equal(maxRowSpacing({ rows: [{ width: 6 }, { width: 9, offset: { before: 15 } }] }), 7.5);
  assert.equal(maxRowSpacing({ rows: [{ width: 8, offset: { before: 15, after: 15 } }] }), 8);
  assert.equal(maxRowSpacing({ rows: [] }), null);
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

test("/internal/economics: grove-team only", async () => {
  for (const [user, status] of [
    [undefined, 401],
    [{ roles: [] }, 403],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    for (const [path, method] of [["/assumptions", "GET"], ["/assumptions/import", "POST"], ["/farms", "GET"], ["/", "GET"], ["/", "POST"],
      ["/000000000000000000000002", "GET"], ["/000000000000000000000002", "PUT"], ["/000000000000000000000002", "DELETE"], ["/000000000000000000000002/result", "GET"]] as const) {
      const r = await fetch(`${base}/internal/economics${path}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : "{}" });
      assert.equal(r.status, status, `${method} ${path}`);
    }
  }
});
