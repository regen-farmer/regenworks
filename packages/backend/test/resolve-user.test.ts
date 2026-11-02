// Account rules: who becomes which GroveWorks user. The email check is what
// stops account takeover, so these tests must fail if it's removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUser } from "../src/auth/resolveUser.ts";

type Doc = { externalId?: string; email?: string; save: () => Promise<void> };

function fakeUsers(initial: Omit<Doc, "save">[] = []) {
  const docs: Doc[] = initial.map((d) => ({ ...d, save: async () => {} }));
  let upserts = 0;
  const match = (q: any) => (d: Doc) =>
    Object.entries(q).every(([k, v]: [string, any]) => (d as any)[k] === (v?.$eq ?? v));
  const model: any = {
    findOne: (q: any) => ({ exec: async () => docs.find(match(q)) ?? null }),
    findOneAndUpdate: (q: any, update: any) => ({
      exec: async () => {
        upserts++;
        const found = docs.find(match(q));
        if (found) return found;
        const doc: Doc = { ...update.$setOnInsert, save: async () => {} };
        docs.push(doc);
        return doc;
      },
    }),
  };
  return { model, docs, upserts: () => upserts };
}

const id = (sub: string, email?: string, email_verified = true) =>
  ({ sub, email, email_verified, source: "auth0" }) as const;

test("no identity → no user", async () => {
  assert.equal(await resolveUser(null, fakeUsers().model), null);
});

test("known Auth0 id → that account", async () => {
  const u = fakeUsers([{ externalId: "auth0|1", email: "a@b.dk" }]);
  const user = await resolveUser(id("auth0|1", "a@b.dk"), u.model);
  assert.equal(user?.externalId, "auth0|1");
  assert.equal(u.docs.length, 1);
});

test("new login method with VERIFIED email → links the existing account", async () => {
  const u = fakeUsers([{ externalId: "auth0|old", email: "kris@grove.dk" }]);
  const user = await resolveUser(id("google|new", "kris@grove.dk", true), u.model);
  assert.equal(user, u.docs[0]);
  assert.equal(u.docs[0].externalId, "google|new");
});

test("UNVERIFIED email matching an account → anonymous, account untouched", async () => {
  const u = fakeUsers([{ externalId: "auth0|kris", email: "kris@grove.dk" }]);
  const user = await resolveUser(id("auth0|attacker", "kris@grove.dk", false), u.model);
  assert.equal(user, null);
  assert.equal(u.docs[0].externalId, "auth0|kris");
  assert.equal(u.docs.length, 1);
});

test("unknown sub, new email → new account", async () => {
  const u = fakeUsers();
  const user = await resolveUser(id("auth0|2", "new@farm.dk"), u.model);
  assert.equal(user?.externalId, "auth0|2");
  assert.equal(user?.email, "new@farm.dk");
});

test("unknown sub, no email → new account without email", async () => {
  const u = fakeUsers();
  const user = await resolveUser(id("auth0|3"), u.model);
  assert.equal(user?.externalId, "auth0|3");
  assert.equal("email" in (user as object), false);
});

test("parallel first requests from a new user → one account", async () => {
  const u = fakeUsers();
  const users = await Promise.all(
    [1, 2, 3].map(() => resolveUser(id("auth0|4", "x@y.dk"), u.model)),
  );
  assert.equal(u.docs.length, 1);
  assert.ok(users.every((x) => x === u.docs[0]));
});

test("duplicate-key race → reads the account created by the other request", async () => {
  const u = fakeUsers();
  u.model.findOneAndUpdate = () => ({
    exec: async () => {
      u.docs.push({ externalId: "auth0|5", save: async () => {} });
      throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
    },
  });
  const user = await resolveUser(id("auth0|5"), u.model);
  assert.equal(user?.externalId, "auth0|5");
});
