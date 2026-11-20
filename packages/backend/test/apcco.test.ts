// Section D (APCCO Uganda): import checks, summaries, readiness, the SHAMBA scenario and request.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  TEMPLATES,
  buildShambaRequest,
  checkShambaTreeTable,
  cleanShambaScenario,
  coffeeSummary,
  draftShambaScenario,
  growthFrom,
  inputHash,
  monthlyClimate,
  parameterLabel,
  parseImport,
  readiness,
  runnerConfig,
  shadeSummary,
  shambaTreeRowNames,
  siteSummary,
  soilSummary,
  tableFromCsv,
  templateCsv,
} from "../src/internal/apcco.ts";
import internalRoutes from "../src/routes/internal.ts";

test("every template's example row imports cleanly (except the 12-month rule)", () => {
  for (const kind of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
    const r = parseImport(kind, templateCsv(kind));
    if (kind === "climate-monthly") assert.equal(r.ok, false, "one month is not a year");
    else assert.ok(r.ok, `${kind}: ${!r.ok && r.errors.join("; ")}`);
  }
});

test("import: missing column, bad number, range, duplicate id and decimal comma", () => {
  const miss = parseImport("shade-trees", "tree_id,species\nA,Albizia\n");
  assert.ok(!miss.ok && /dbh_cm/.test(miss.errors[0]));
  const bad = parseImport("shade-trees", "tree_id,species,dbh_cm,height_m\nA,Albizia,abc,5\nB,Ficus,30,500\nA,Cordia,20,\n");
  assert.ok(!bad.ok);
  assert.ok(bad.errors.some((e) => /Row 2: dbh_cm "abc"/.test(e)));
  assert.ok(bad.errors.some((e) => /Row 3: height_m 500 is outside/.test(e)));
  const dup = parseImport("shade-trees", "tree_id,species,dbh_cm\nA,Albizia,30\nA,Ficus,20\n");
  assert.ok(!dup.ok && /Tree A appears more than once/.test(dup.errors[0]));
  const comma = parseImport("shade-trees", 'tree_id,species,dbh_cm,extra\nA,Albizia,"34,5",x\n');
  assert.ok(comma.ok);
  assert.equal(comma.rows[0].dbh_cm, 34.5);
  assert.match(comma.warnings[0], /Ignored column\(s\): extra/);
});

test("import: overlapping soil layers of one sampling point are refused", () => {
  const r = parseImport("soil", "sample_id,depth_top_cm,depth_bottom_cm,soc_pct,bulk_density_g_cm3\nS1,0,30,2,1.2\nS1,0,15,2,1.2\nS1,15,30,1,1.4\nS2,0,15,2,1.2\nS2,15,30,1,1.4\n");
  assert.ok(!r.ok && /S1: layers 0–30 cm and 0–15 cm overlap/.test(r.errors[0]), !r.ok ? r.errors.join() : "");
});

test("SHAMBA tree tables: 10 columns, 3 numeric rows; row names for the form", () => {
  const ok = tableFromCsv("Sc,Name,N_leaf,N_branch,N_stem,N_croot,N_Froot,C,rs,wood_dens,\n1,1,0.02,0.002,0.002,0.002,0.01,0.5,0.3,0.62,robusta\n2,2,0.03,0.006,0.004,0.012,0.02,0.5,0.4,0.55,albizia\n3,3,0.03,0.006,0.004,0.012,0.02,0.5,0.4,0.42,ficus\n") as any;
  assert.equal(checkShambaTreeTable(ok), null);
  assert.deepEqual(shambaTreeRowNames({ tree: ok }), ["robusta", "albizia", "ficus"]);
  assert.deepEqual(shambaTreeRowNames(undefined), ["default", "enterolobium", "faidherbia"]);
  const two = { ...ok, rows: ok.rows.slice(0, 2) };
  assert.match(checkShambaTreeTable(two)!, /at least 3 rows/);
  const text = { ...ok, rows: [ok.rows[0], ok.rows[1], [3, 3, "x", 0, 0, 0, 0, 0.5, 0.4, 0.4, "y"]] };
  assert.match(checkShambaTreeTable(text)!, /row 3, column N_leaf/);
});

test("import: dates, soil layers, and tmin above tmax are refused", () => {
  const d = parseImport("weather-daily", "date,tmin_c,tmax_c\n2027-02-30,15,25\n");
  assert.ok(!d.ok && /not a date/.test(d.errors[0]));
  const s = parseImport("soil", "sample_id,depth_top_cm,depth_bottom_cm\nS1,30,10\n");
  assert.ok(!s.ok && /bottom of the layer/.test(s.errors[0]));
  const t = parseImport("weather-daily", "date,tmin_c,tmax_c\n2027-01-01,30,20\n");
  assert.ok(!t.ok && /minimum temperature above the maximum/.test(t.errors[0]));
});

test("soil: carbon stock 0–30 cm from SOC × bulk density × depth, clay depth-weighted", () => {
  const s = soilSummary([
    { sample_id: "S1", depth_top_cm: 0, depth_bottom_cm: 15, soc_pct: 2, bulk_density_g_cm3: 1.2, clay_pct: 30 },
    { sample_id: "S1", depth_top_cm: 15, depth_bottom_cm: 30, soc_pct: 1, bulk_density_g_cm3: 1.4, clay_pct: 40 },
    { sample_id: "S2", depth_top_cm: 0, depth_bottom_cm: 40, soc_pct: 1.5, bulk_density_g_cm3: 1.3, clay_pct: 35 },
    { sample_id: "S3", depth_top_cm: 0, depth_bottom_cm: 10, soc_pct: 3, bulk_density_g_cm3: 1.1 },
  ]);
  // S1: 2×1.2×15 + 1×1.4×15 = 36 + 21 = 57; S2: 1.5×1.3×30 = 58.5 (only 0–30 counts); S3 too shallow
  assert.equal(s.socTcHa0to30, 57.8);
  assert.equal(s.pointsWithStock, 2);
  assert.equal(s.pointsPartial, 1);
  assert.equal(s.clayPct, 35);
});

test("climate: monthly import (PET ÷ 0.75), or daily data covering every month", () => {
  const monthly = Array.from({ length: 12 }, (_, i) => ({ month: 12 - i, temp_c: 22, rain_mm: 100 + i, pet_mm: 120, evap_mm: null }));
  const m = monthlyClimate({ "climate-monthly": monthly });
  assert.equal(m.climate!.length, 12);
  assert.equal(m.climate![0].rain_mm, 111, "sorted to January first");
  assert.equal(m.climate![0].evap_mm, 160);

  const daily: any[] = [];
  for (let d = new Date(Date.UTC(2026, 0, 1)); d < new Date(Date.UTC(2027, 0, 1)); d = new Date(d.getTime() + 86400_000)) {
    daily.push({ date: d.toISOString().slice(0, 10), tmin_c: 16, tmax_c: 28, rain_mm: 3, pet_mm: 3 });
  }
  const c = monthlyClimate({ "weather-daily": daily });
  assert.equal(c.from, "daily weather");
  assert.equal(c.climate![0].temp_c, 22);
  assert.equal(c.climate![0].rain_mm, 93);
  assert.equal(c.climate![1].rain_mm, 84, "February 2026 has 28 days");
  assert.equal(c.climate![0].evap_mm, 124);

  const gap = monthlyClimate({ "weather-daily": daily.filter((r) => !r.date.startsWith("2026-07")) });
  assert.equal(gap.climate, null);
  assert.match(gap.problem!, /month\(s\) 7/);
});

test("shade and coffee summaries: per ha, basal-area order, bushes per ha", () => {
  const s = shadeSummary(
    [
      { species: "Albizia coriaria", dbh_cm: 40, age_years: 15 },
      { species: "Albizia coriaria", dbh_cm: 30 },
      { species: "Ficus natalensis", dbh_cm: 60 },
      { species: "Markhamia lutea", dbh_cm: 10 },
    ],
    2,
  );
  assert.equal(s.perHa, 2);
  assert.deepEqual(s.species.map((x) => x.species), ["Ficus natalensis", "Albizia coriaria", "Markhamia lutea"]);
  assert.equal(s.species[1].perHa, 1);
  assert.equal(s.species[1].withAge, 1);
  const c = coffeeSummary([
    { plot_id: "P1", area_m2: 100, bushes: 11, coffee_type: "Robusta", age_years: 8, stem_diam_cm: 6 },
    { plot_id: "P2", area_m2: 100, bushes: 13, coffee_type: "robusta", age_years: 10, stem_diam_cm: 7 },
  ]);
  assert.equal(c.bushesPerHa, 1200);
  assert.deepEqual(c.coffeeTypes, ["robusta"]);
});

test("growth curve: six rising points from age 0, observed rate then half", () => {
  const g = growthFrom(10, 20, 30);
  assert.equal(g.length, 6);
  assert.equal(g[0].age, 0);
  assert.equal(g[2].age, 10);
  assert.equal(g[2].diamCm, 20);
  assert.equal(g[5].age, 30);
  assert.equal(g[5].diamCm, 40, "2 cm/yr to age 10, then 1 cm/yr");
  for (let i = 1; i < 6; i++) assert.ok(g[i].age > g[i - 1].age && g[i].diamCm >= g[i - 1].diamCm);
  const young = growthFrom(1, 2, 3);
  for (let i = 1; i < 6; i++) assert.ok(young[i].age > young[i - 1].age, "ages stay strictly rising");
});

function exampleSite() {
  const data: any = {
    "shade-trees": [
      { species: "Albizia coriaria", dbh_cm: 40, age_years: 15 },
      { species: "Albizia coriaria", dbh_cm: 30, age_years: 12 },
      { species: "Ficus natalensis", dbh_cm: 60 },
      { species: "Markhamia lutea", dbh_cm: 10, age_years: 5 },
      { species: "Cordia africana", dbh_cm: 12 },
    ],
    "coffee-plots": [{ plot_id: "P1", area_m2: 100, bushes: 11, coffee_type: "robusta", age_years: 8, stem_diam_cm: 6.4 }],
    soil: [{ sample_id: "S1", depth_top_cm: 0, depth_bottom_cm: 30, soc_pct: 1.8, bulk_density_g_cm3: 1.2, clay_pct: 38 }],
    "climate-monthly": Array.from({ length: 12 }, (_, i) => ({ month: i + 1, temp_c: 22, rain_mm: 110, pet_mm: 120, evap_mm: null })),
  };
  return { site: { lat: 0.35, lon: 32.75, areaHa: 2 }, data };
}

test("draft scenario: coffee + two largest shade species + the rest, densities per ha", () => {
  const { site, data } = exampleSite();
  const { scenario, notes } = draftShambaScenario(siteSummary(site, data));
  assert.equal(scenario.cohorts.length, 3);
  assert.equal(scenario.cohorts[0].densityPerHa, 1100);
  assert.match(scenario.cohorts[0].label, /robusta/);
  assert.equal(scenario.cohorts[1].label, "Ficus natalensis");
  assert.equal(scenario.cohorts[1].densityPerHa, 1, "0.5/ha rounds to whole trees (SHAMBA reads an integer)");
  assert.match(scenario.cohorts[2].label, /Albizia coriaria \+ 2 other species/);
  assert.equal(scenario.cohorts[2].densityPerHa, 2, "Albizia 2 + the other two 1 each = 4 trees on 2 ha");
  for (const c of scenario.cohorts) assert.ok(Number.isInteger(c.densityPerHa));
  assert.ok(notes.some((n) => /Ficus natalensis: no ages/.test(n)));
  assert.ok(cleanShambaScenario(scenario).ok, "the draft passes its own checks");
});

test("scenario checks: years, cohorts, growth curve shape", () => {
  const { site, data } = exampleSite();
  const { scenario } = draftShambaScenario(siteSummary(site, data));
  assert.equal(cleanShambaScenario({ ...scenario, years: 0 }).ok, false);
  assert.equal(cleanShambaScenario({ ...scenario, cohorts: [] }).ok, false);
  assert.equal(cleanShambaScenario({ ...scenario, cohorts: [...scenario.cohorts, scenario.cohorts[0]] }).ok, false);
  const falling = structuredClone(scenario);
  falling.cohorts[0].growth[3].diamCm = 0;
  assert.match((cleanShambaScenario(falling) as any).error, /must not fall/);
  const frac = structuredClone(scenario);
  frac.cohorts[1].densityPerHa = 0.5;
  assert.match((cleanShambaScenario(frac) as any).error, /whole number/);
  const late = structuredClone(scenario);
  late.cohorts[1].plantYear = 99;
  assert.match((cleanShambaScenario(late) as any).error, /planting year/);
  assert.equal(cleanShambaScenario({ ...scenario, gwp: "AR9" }).ok, false);
});

test("SHAMBA request: cohort keys, baseline coffee, crops off, allometry per cohort", () => {
  const { site, data } = exampleSite();
  const sum = siteSummary(site, data);
  const { scenario } = draftShambaScenario(sum);
  const req = buildShambaRequest(site, sum.climate.climate!, { socTcHa: sum.soil.socTcHa0to30!, clayPct: sum.soil.clayPct! }, scenario, { tree: { columns: ["Sc"], rows: [[1]] } });
  // growth curves differ per cohort here, so a mix-up would show
  assert.notEqual(scenario.cohorts[1].growth[2].diamCm, scenario.cohorts[0].growth[2].diamCm);
  const iv = req.inputs.intervention;
  assert.equal(iv.yrs_proj, 30);
  assert.equal(iv.proj_plant_dens1, 1100);
  assert.equal(iv.base_plant_dens, 1100, "baseline = coffee without shade");
  assert.equal(iv.proj_plant_dens2, 1);
  // SHAMBA ties tree parameters and the growth curve to the species number: cohort k = species k
  assert.deepEqual([iv.species1, iv.species2, iv.species3, iv.species_base], [1, 2, 3, 1]);
  assert.equal(iv.sp2_diam3, scenario.cohorts[1].growth[2].diamCm, "cohort 2's own curve under sp2_");
  assert.equal(iv.sp3_diam3, scenario.cohorts[2].growth[2].diamCm, "cohort 3's own curve under sp3_");
  for (const [k, v] of Object.entries(iv)) if (/dens/.test(k)) assert.ok(Number.isInteger(v), `${k} = ${v}`);
  assert.equal(iv.age3, 8, "first cohort's curve has no prefix (coffee age 8)");
  assert.equal(iv.sp2_age1, 0);
  assert.ok("sp3_diam6" in iv);
  assert.equal(iv.crop_proj_spp1, 0);
  assert.equal(req.inputs.site.soil.soc_t_c_per_ha, 64.8);
  assert.equal(req.inputs.site.climate[0].evap_mm, 160);
  assert.equal(req.inputs.options.n_cohorts, 3);
  assert.equal(req.inputs.options.allometry.length, 4);
  assert.deepEqual(Object.keys(req.inputs.parameters), ["tree"]);
  const none = buildShambaRequest(site, sum.climate.climate!, { socTcHa: 60, clayPct: 30 }, { ...scenario, baseline: "none" }, undefined);
  assert.equal(none.inputs.intervention.base_plant_dens, 0);
  assert.deepEqual(none.inputs.parameters, {});
});

test("readiness: SHAMBA ready on the example; DynACof and CAF list what's missing", () => {
  const { site, data } = exampleSite();
  const r = readiness(site, data);
  assert.ok(r.models.shamba.checks.every((c) => c.ok), r.models.shamba.checks.filter((c) => !c.ok).map((c) => c.item).join(", "));
  assert.ok(r.models.dynacof.checks.some((c) => c.item.startsWith("Daily weather") && !c.ok));
  assert.ok(r.models.caf2021.checks.some((c) => c.item === "Soil nitrogen" && !c.ok));
  const empty = readiness({ lat: 0, lon: 32 }, {});
  assert.ok(empty.models.shamba.checks.some((c) => c.item === "Site area" && !c.ok));
});

test("parameter tables, labels, input hash and runner config", () => {
  const t = tableFromCsv("Sc,Name,wood_dens\n1,robusta,0.62\n2,albizia,\n");
  assert.ok(typeof t !== "string");
  assert.deepEqual(t.rows, [[1, "robusta", 0.62], [2, "albizia", null]]);
  assert.equal(typeof tableFromCsv("Sc\n"), "string");
  assert.equal(parameterLabel({ model: "shamba", name: "Robusta Uganda", status: "calibrated", dataset: "ROBUST", version: "v2" }), "SHAMBA · Robusta Uganda · calibrated · ROBUST · v2");
  assert.equal(inputHash({ b: 1, a: [1, { y: 2, x: 1 }] }), inputHash({ a: [1, { x: 1, y: 2 }], b: 1 }));
  assert.notEqual(inputHash({ a: 1 }), inputHash({ a: 2 }));
  delete process.env.MODEL_SHAMBA_URL;
  assert.equal(runnerConfig("shamba"), null);
  process.env.MODEL_SHAMBA_URL = "https://shamba.example.run.app/";
  process.env.MODEL_SHAMBA_TOKEN = "t";
  assert.deepEqual(runnerConfig("shamba"), { url: "https://shamba.example.run.app", token: "t" });
  process.env.MODEL_SHAMBA_URL = "file:///etc/passwd";
  assert.equal(runnerConfig("shamba"), null);
  delete process.env.MODEL_SHAMBA_URL;
  delete process.env.MODEL_SHAMBA_TOKEN;
});

// the guard: field users and the public can't reach section D
const app = express();
let who: any = {};
app.use((req: any, _res, next) => {
  req.user = who.user;
  req.idToken = who.idToken;
  next();
});
app.use("/internal", internalRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test("/internal/apcco: public 403, field user 403, team user gets the templates", async () => {
  const verified = { email_verified: true };
  who = { user: { roles: [] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/apcco/templates`)).status, 403);
  who = { user: { roles: ["grove-field"] }, idToken: verified };
  assert.equal((await fetch(`${base}/internal/apcco/templates`)).status, 403);
  who = { user: { roles: ["grove-team"] }, idToken: verified };
  const res = await fetch(`${base}/internal/apcco/templates`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.templates["shade-trees"].columns.some((c: any) => c.name === "dbh_cm" && c.required));
  const csv = await fetch(`${base}/internal/apcco/templates/soil.csv`);
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /^sample_id,plot_id/);
});

test("the app-wide 100 kB JSON parser leaves /internal/apcco to its own 6 MB parser", async () => {
  const { defaultJson } = await import("../src/middleware/jsonBody.ts");
  const app2 = express();
  app2.use(defaultJson());
  app2.post("/internal/apcco/x", express.json({ limit: "6mb" }), (req, res) => res.send({ n: req.body.csv.length }));
  app2.post("/other", (req, res) => res.send({ n: req.body?.csv?.length }));
  const srv = app2.listen(0);
  const b = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const body = JSON.stringify({ csv: "x".repeat(200_000) });
  const ok = await fetch(`${b}/internal/apcco/x`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(ok.status, 200);
  const other = await fetch(`${b}/other`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.equal(other.status, 413);
  srv.close();
});

test("tree-row names: the trailing name column, else the Name column (not a number)", () => {
  const ten = tableFromCsv("Sc,Name,N_leaf,N_branch,N_stem,N_croot,N_Froot,C,rs,wood_dens\n1,robusta,0.02,0.002,0.002,0.002,0.01,0.5,0.3,0.62\n2,albizia,0.03,0.006,0.004,0.012,0.02,0.5,0.4,0.55\n3,ficus,0.03,0.006,0.004,0.012,0.02,0.5,0.4,0.42\n") as any;
  assert.deepEqual(shambaTreeRowNames({ tree: ten }), ["robusta", "albizia", "ficus"]);
});
