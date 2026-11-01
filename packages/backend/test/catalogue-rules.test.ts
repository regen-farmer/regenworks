// Plant catalogue rules: sharing permissions, input cleaning, design plant checks.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCreate,
  canEdit,
  checkDesignPlants,
  cleanCultivar,
  cleanHybridGroup,
  cleanRootstock,
  isVisible,
  referencedIds,
} from "../src/catalogue/rules.ts";

const id = (n: number) => n.toString(16).padStart(24, "0");
const HAZEL = id(1);
const CHESTNUT = id(2);
const COLURNA = id(3);
const kris = { _id: id(100), roles: ["grove-admin"] };
const team = { _id: id(101), roles: ["grove-team"] };
const field = { _id: id(102), roles: ["grove-field"] };
const pub = { _id: id(103), roles: [] };

test("public and field users can't add to or change the shared list", () => {
  assert.equal(canCreate(pub, true), false);
  assert.equal(canCreate(field, true), false);
  assert.equal(canCreate(team, true), true);
  assert.equal(canCreate(pub, false), true);
  const shared = { shared: true, owner: { id: pub._id } };
  assert.equal(canEdit(pub, shared), false, "even the original creator once it is shared");
  assert.equal(canEdit(team, shared), true);
});

test("private entries: owner and Grove admin only", () => {
  const mine = { shared: false, owner: { id: pub._id } };
  assert.equal(canEdit(pub, mine), true);
  assert.equal(canEdit(field, mine), false);
  assert.equal(canEdit(team, mine), false);
  assert.equal(canEdit(kris, mine), true);
  assert.equal(isVisible(mine, [pub._id]), true);
  assert.equal(isVisible(mine, [team._id]), false);
  assert.equal(isVisible({ shared: true }, []), true);
});

test("cultivar input: needs name and valid species; shared parsed strictly", () => {
  assert.equal(cleanCultivar({}).ok, false);
  assert.equal(cleanCultivar({ name: "Corabel", species: "nope" }).ok, false);
  const c = cleanCultivar({ name: "  Corabel ", species: HAZEL, vigour: "vigorous", shared: "yes" });
  assert.ok(c.ok);
  assert.equal(c.value.name, "Corabel");
  assert.equal(c.value.shared, false);
  assert.equal(cleanCultivar({ name: "X", species: HAZEL, vigour: "huge" }).ok, false);
  assert.equal(cleanCultivar({ name: { $gt: "" }, species: HAZEL }).ok, false);
});

test("rootstock input: species optional", () => {
  const r = cleanRootstock({ name: "Corylus colurna seedling", propagation: "seedling" });
  assert.ok(r.ok);
  assert.equal(r.value.species, undefined);
  assert.equal(cleanRootstock({ name: "MM106", propagation: "grafted" }).ok, false);
});

test("hybrid group: two or more distinct parents, grows-like among them", () => {
  const four = [id(10), id(11), id(12), id(13)];
  const ok = cleanHybridGroup({ nameCommon: "Castanea complex hybrid", genus: "Castanea", parents: four, growsLike: id(12) });
  assert.ok(ok.ok);
  assert.equal(ok.value.parents.length, 4);
  assert.equal(ok.value.parentageCertainty, "uncertain");
  assert.equal(cleanHybridGroup({ nameCommon: "X", genus: "Castanea", parents: [id(10), id(10)] }).ok, false);
  assert.equal(
    cleanHybridGroup({ nameCommon: "X", genus: "Castanea", parents: [id(10), id(11)], growsLike: id(12) }).ok,
    false,
  );
});

const corabel = { _id: id(20), name: "Corabel", species: HAZEL, shared: true };
const privateCultivar = { _id: id(21), name: "Secret", species: HAZEL, shared: false, owner: { id: pub._id } };
const colurna = { _id: id(30), name: "Corylus colurna seedling", species: COLURNA, shared: true };
const catalogue = {
  varieties: new Map<string, any>([[corabel._id, corabel], [privateCultivar._id, privateCultivar]]),
  rootstocks: new Map<string, any>([[colurna._id, colurna]]),
};
const row = (...sequence: any[]) => ({ width: 4.5, sequence });

test("design: species-only entries pass unchanged (old designs keep working)", () => {
  const r = checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5 })], catalogue, [team._id]);
  assert.ok(r.ok);
  assert.deepEqual(r.value[0].sequence[0], { species: HAZEL, spacingAfter: 4.5 });
});

test("design: cultivar, rootstock and organic are kept; blanks mean not decided", () => {
  const r = checkDesignPlants(
    [
      row(
        { species: HAZEL, spacingAfter: 4.5, variety: corabel._id, rootstock: colurna._id, organic: true },
        { species: HAZEL, spacingAfter: 4.5, variety: "", rootstock: "", ownRoots: true, organic: "x" },
      ),
    ],
    catalogue,
    [team._id],
  );
  assert.ok(r.ok);
  assert.deepEqual(r.value[0].sequence[0], {
    species: HAZEL, spacingAfter: 4.5, variety: corabel._id, rootstock: colurna._id, organic: true,
  });
  assert.deepEqual(r.value[0].sequence[1], { species: HAZEL, spacingAfter: 4.5, ownRoots: true });
});

test("design: cultivar must belong to the row's species", () => {
  const r = checkDesignPlants([row({ species: CHESTNUT, spacingAfter: 8, variety: corabel._id })], catalogue, [team._id]);
  assert.equal(r.ok, false);
  assert.match((r as any).errors[0], /Row 1, tree 1: cultivar Corabel belongs to a different species/);
});

test("design: someone else's private cultivar or an unknown one is refused", () => {
  const r = checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5, variety: privateCultivar._id })], catalogue, [team._id]);
  assert.equal(r.ok, false);
  const ok = checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5, variety: privateCultivar._id })], catalogue, [pub._id]);
  assert.ok(ok.ok, "the owner of the design may use their own private cultivar");
  assert.equal(checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5, variety: id(99) })], catalogue, [team._id]).ok, false);
});

test("design: rootstock and own roots together is refused", () => {
  const r = checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5, rootstock: colurna._id, ownRoots: true })], catalogue, [team._id]);
  assert.equal(r.ok, false);
});

test("referencedIds collects valid ids only", () => {
  const ids = referencedIds([row({ variety: corabel._id, rootstock: "bad" }, { variety: { _id: corabel._id } })]);
  assert.deepEqual(ids, { varieties: [corabel._id], rootstocks: [] });
});

// ---- after review ----
import { canEditDesign, forViewer, stripUnusablePlants } from "../src/catalogue/rules.ts";

test("design save: owner and Grove admin only", () => {
  assert.equal(canEditDesign(pub, pub._id), true);
  assert.equal(canEditDesign(team, pub._id), false, "grove-team can't overwrite a client's design");
  assert.equal(canEditDesign(field, pub._id), false);
  assert.equal(canEditDesign(kris, pub._id), true);
  assert.equal(canEditDesign(undefined, pub._id), false);
  assert.equal(canEditDesign(pub, undefined), false, "design without owner: admin only");
});

test("design: the editor's private cultivar can't go into someone else's design", () => {
  const krisOwn = { _id: id(22), name: "Kris only", species: HAZEL, shared: false, owner: { id: kris._id } };
  const cat = { varieties: new Map<string, any>([[krisOwn._id, krisOwn]]), rootstocks: new Map() };
  const r = checkDesignPlants([row({ species: HAZEL, spacingAfter: 4.5, variety: krisOwn._id })], cat, [pub._id]);
  assert.equal(r.ok, false);
});

test("design: references already stored are kept if valid, dropped if not — never block", () => {
  const stored = { varieties: new Set([privateCultivar._id, id(98)]), rootstocks: new Set([id(97)]) };
  const r = checkDesignPlants(
    [
      row(
        { species: HAZEL, spacingAfter: 4.5, variety: privateCultivar._id },
        { species: HAZEL, spacingAfter: 4.5, variety: id(98), rootstock: id(97) },
        { species: HAZEL, spacingAfter: 4.5, variety: corabel._id },
      ),
    ],
    catalogue,
    [team._id],
    stored,
  );
  assert.ok(r.ok);
  assert.deepEqual(r.value[0].sequence[0], { species: HAZEL, spacingAfter: 4.5 });
  assert.deepEqual(r.value[0].sequence[1], { species: HAZEL, spacingAfter: 4.5 });
  assert.equal(r.value[0].sequence[2].variety, corabel._id);
});

test("presets: public keeps shared plants only; private also the owner's", () => {
  const rows = [row({ species: HAZEL, spacingAfter: 4.5, variety: privateCultivar._id, rootstock: colurna._id })];
  const pubPreset = stripUnusablePlants(rows, catalogue, []);
  assert.equal(pubPreset[0].sequence[0].variety, undefined);
  assert.equal(pubPreset[0].sequence[0].rootstock, colurna._id);
  const own = stripUnusablePlants(rows, catalogue, [pub._id]);
  assert.equal(own[0].sequence[0].variety, privateCultivar._id);
});

test("catalogue: shared entries hide the creator's user id from others", () => {
  const item = { _id: id(40), name: "Corabel", shared: true, owner: { id: team._id } };
  assert.equal("owner" in forViewer(item, pub._id), false);
  assert.equal("owner" in forViewer(item, team._id), true);
  const priv = { _id: id(41), name: "Mine", shared: false, owner: { id: pub._id } };
  assert.equal("owner" in forViewer(priv, pub._id), true);
});
