// Funnel editor, deal sources and the deal report. Made-up deals.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { cleanFunnel, cleanSources, dealReport, DEFAULT_SOURCES, FUNNEL_TEMPLATES, keyFrom, stageAge, stageSince } from "../src/internal/funnels.ts";
import { cleanDeal, firstOpenStage, firstStageOfKind, moveDeal } from "../src/internal/deals.ts";
import internalRoutes from "../src/routes/internal.ts";

const existing = {
  stages: [
    { key: "lead", name: "Lead", kind: "open" as const },
    { key: "offer", name: "Offer sent", kind: "open" as const },
    { key: "won", name: "Won", kind: "won" as const },
    { key: "lost", name: "Lost", kind: "lost" as const },
  ],
};

test("keys from names: Danish letters, unique", () => {
  assert.equal(keyFrom("Møde / besøg på gården", []), "mode-besog-pa-garden");
  assert.equal(keyFrom("Lead", ["lead", "lead-2"]), "lead-3");
  assert.equal(keyFrom("!!!", []), "stage");
});

test("funnel editor: rename keeps keys, new stages get keys, removed stages are listed", () => {
  const r = cleanFunnel(
    {
      name: " Design clients ",
      stages: [
        { key: "lead", name: "New lead", kind: "open", targetDays: "5" },
        { name: "Site visit", kind: "open", targetDays: 10 },
        { key: "won", name: "Won", kind: "won", targetDays: 3 },
        { key: "lost", name: "Lost", kind: "lost" },
      ],
    },
    existing,
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.name, "Design clients");
  assert.deepEqual(r.value.stages.map((s) => [s.key, s.name, s.targetDays]), [
    ["lead", "New lead", 5],
    ["site-visit", "Site visit", 10],
    ["won", "Won", null],
    ["lost", "Lost", null],
  ]);
  assert.deepEqual(r.value.removed, ["offer"]);
});

test("funnel editor: refuses what would break deals", () => {
  const base = (stages: any[]) => cleanFunnel({ name: "X", stages }, existing);
  assert.equal(base([{ name: "A", kind: "open" }, { name: "W", kind: "won" }]).ok, false, "3 stages at least");
  assert.equal(base([{ name: "A", kind: "open" }, { name: "B", kind: "open" }, { name: "W", kind: "won" }]).ok, false, "needs a lost stage");
  assert.equal(base([{ name: "W", kind: "won" }, { name: "A", kind: "open" }, { name: "L", kind: "lost" }]).ok, false, "first stage open");
  assert.equal(base([{ key: "nope", name: "A", kind: "open" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }]).ok, false, "unknown key");
  assert.equal(base([{ key: "lead", name: "A", kind: "open" }, { key: "lead", name: "B", kind: "open" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }]).ok, false, "a key twice");
  assert.equal(base([{ key: { $ne: 1 }, name: "A", kind: "open" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }]).ok, false);
  assert.equal(base([{ name: "A", kind: "maybe" }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }]).ok, false);
  assert.equal(base([{ name: "A", kind: "open", targetDays: 0 }, { name: "W", kind: "won" }, { name: "L", kind: "lost" }]).ok, false);
  assert.equal(cleanFunnel({ name: "", stages: existing.stages }).ok, false);
  assert.equal(cleanFunnel({ name: "X", stages: Array.from({ length: 21 }, (_, i) => ({ name: `S${i}`, kind: i === 19 ? "won" : i === 20 ? "lost" : "open" })) }).ok, false);
});

test("funnel editor: kind changes are reported; removed keys are never reused", () => {
  const r = cleanFunnel(
    { name: "X", stages: [{ key: "lead", name: "Lead", kind: "open" }, { key: "offer", name: "Offer sent", kind: "won" }, { key: "lost", name: "Lost", kind: "lost" }] },
    { ...existing, usedKeys: ["lead", "offer", "won", "lost", "meeting"] },
  );
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.value.kindChanged, ["offer"], "the route refuses this while deals are in Offer sent");
  assert.deepEqual(r.value.removed, ["won"]);
  const again = cleanFunnel({ name: "X", stages: [{ key: "lead", name: "Lead", kind: "open" }, { name: "Meeting", kind: "open" }, { name: "Won", kind: "won" }, { key: "lost", name: "Lost", kind: "lost" }] }, { stages: [existing.stages[0], existing.stages[3]], usedKeys: ["lead", "meeting", "won", "lost"] });
  assert.ok(again.ok);
  if (!again.ok) return;
  assert.deepEqual(again.value.stages.map((s) => s.key), ["lead", "meeting-2", "won-2", "lost"], "old keys (and their history) stay retired");
  assert.ok(again.value.usedKeys.includes("meeting-2") && again.value.usedKeys.includes("meeting"));
});

test("custom funnels work with moves and 'offer accepted' (won stage found by kind, not key)", () => {
  const t = FUNNEL_TEMPLATES.find((x) => x.key === "corporate")!;
  const c = cleanFunnel({ name: t.name, stages: t.stages.map((s) => ({ ...s, key: undefined })) });
  assert.ok(c.ok);
  if (!c.ok) return;
  const f = { _id: "fc", stages: c.value.stages };
  assert.equal(firstOpenStage(f)?.key, "idea");
  const won = firstStageOfKind(f, "won")!;
  assert.equal(won.key, "pilot-contract");
  const m = moveDeal({ funnel: "fc", stage: "proposal", status: "open", history: [] }, f, won.key, { now: new Date("2027-01-01") })!;
  assert.equal(m.patch.status, "won");
  assert.ok(m.wonNow);
});

test("templates are valid funnels", () => {
  for (const t of FUNNEL_TEMPLATES) assert.ok(cleanFunnel({ name: t.name, stages: t.stages.map((s) => ({ ...s, key: undefined })) }).ok, t.key);
});

test("sources: unique, trimmed, ØRD in the defaults", () => {
  assert.ok(DEFAULT_SOURCES.some((s) => s.startsWith("ØRD")));
  assert.deepEqual(cleanSources({ sources: [" ØRD ", "Website", ""] }), { ok: true, value: ["ØRD", "Website"] });
  assert.equal(cleanSources({ sources: ["A", "a"] }).ok, false);
  assert.equal(cleanSources({ sources: [] }).ok, false);
  assert.equal(cleanSources({ sources: [{ $ne: 1 }] }).ok, false);
  assert.equal((cleanDeal({ sourceDetail: "  Anita, ØRD, check 12 Nov " }) as any).value.sourceDetail, "Anita, ØRD, check 12 Nov");
});

const d = (iso: string) => new Date(iso);
const deal = (over: any) => ({ funnel: "f1", stage: "lead", status: "open", createdAt: d("2026-11-01"), history: [{ stage: "lead", funnel: "f1", at: d("2026-11-01") }], ...over });

test("time in stage: from the last move there; marked when past the target", () => {
  const x = deal({ stage: "offer", history: [{ stage: "lead", funnel: "f1", at: d("2026-11-01") }, { stage: "offer", funnel: "f1", at: d("2026-11-03") }] });
  assert.equal(stageSince(x), "2026-11-03T00:00:00.000Z");
  const now = d("2026-11-10T12:00:00Z");
  assert.deepEqual(stageAge(x, { key: "offer", name: "Offer", kind: "open", targetDays: 5 }, now), { since: "2026-11-03T00:00:00.000Z", days: 7, over: true });
  assert.equal(stageAge(x, { key: "offer", name: "Offer", kind: "open", targetDays: 7 }, now).over, false);
  assert.equal(stageAge({ ...x, status: "won" }, { key: "offer", name: "Offer", kind: "open", targetDays: 1 }, now).over, false);
  assert.equal(stageSince({ funnel: "f1", stage: "lead", status: "open", createdAt: d("2026-10-01") }), "2026-10-01T00:00:00.000Z");
});

test("report: by source with win rate; days per stage from the history", () => {
  const funnels = [{ _id: "f1", name: "Design", stages: existing.stages.map((s) => ({ ...s, targetDays: null })) }];
  const deals = [
    deal({ source: "ØRD", status: "won", stage: "won", value: 100, history: [{ stage: "lead", funnel: "f1", at: d("2026-11-01") }, { stage: "offer", funnel: "f1", at: d("2026-11-05") }, { stage: "won", funnel: "f1", at: d("2026-11-07") }] }),
    deal({ source: "ØRD", status: "lost", stage: "lost", history: [{ stage: "lead", funnel: "f1", at: d("2026-11-01") }, { stage: "lost", funnel: "f1", at: d("2026-11-03") }] }),
    deal({ source: "Website", value: 50 }),
    deal({ createdAt: d("2025-01-01"), source: "Old" }),
  ];
  const r = dealReport(deals, funnels, { from: d("2026-01-01") }, d("2026-11-11"));
  assert.equal(r.deals, 3);
  assert.deepEqual(r.bySource.map((s) => [s.source, s.deals, s.won, s.lost, s.winRate, s.wonValue]), [
    ["ØRD", 2, 1, 1, 50, 100],
    ["Website", 1, 0, 0, null, 0],
  ]);
  const f = r.byFunnel[0];
  assert.equal(f.winRate, 50);
  const lead = f.stages.find((s) => s.key === "lead")!;
  assert.equal(lead.entered, 3);
  assert.equal(lead.movedOn, 2);
  assert.equal(lead.now, 1);
  assert.equal(lead.avgDays, 5.3, "(4 + 2 + 10 days still there) / 3");
  assert.equal(f.stages.find((s) => s.key === "offer")!.avgDays, 2);
  assert.equal(f.stages.find((s) => s.key === "won")!.avgDays, null);
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

test("funnel editor, sources and report: grove-team only", async () => {
  const json = { "content-type": "application/json" };
  for (const [user, status] of [
    [undefined, 401],
    [{ _id: "000000000000000000000001", roles: ["grove-field"] }, 403],
  ] as const) {
    who = user ? { user, idToken: { email_verified: true } } : {};
    assert.equal((await fetch(`${base}/internal/funnels`, { method: "POST", headers: json, body: "{}" })).status, status);
    assert.equal((await fetch(`${base}/internal/funnels/000000000000000000000002`, { method: "PUT", headers: json, body: "{}" })).status, status);
    assert.equal((await fetch(`${base}/internal/funnels/000000000000000000000002`, { method: "DELETE" })).status, status);
    assert.equal((await fetch(`${base}/internal/deals/sources`, { method: "PUT", headers: json, body: "{}" })).status, status);
    assert.equal((await fetch(`${base}/internal/deals/report`)).status, status);
  }
});

test("attention: overdue or missing next action, slow stage, closing soon", async () => {
  const { attentionReasons } = await import("../src/internal/funnels.ts");
  const now = new Date("2026-11-20T10:00:00Z");
  const stage = { key: "lead", name: "Lead", kind: "open" as const, targetDays: 5 };
  const keys = (x: any) => attentionReasons(x, stage, now).map((r) => r.key);
  assert.deepEqual(keys(deal({ nextAction: { date: "2026-11-25" } })), ["slow"], "19 days in Lead, target 5");
  assert.deepEqual(keys(deal({ nextAction: { date: "2026-11-18" }, history: [{ stage: "lead", funnel: "f1", at: d("2026-11-19") }] })), ["overdue"]);
  assert.deepEqual(keys(deal({ history: [{ stage: "lead", funnel: "f1", at: d("2026-11-19") }], expectedClose: "2026-11-30" })), ["no-action", "closing"]);
  assert.deepEqual(keys(deal({ status: "won" })), []);
});
