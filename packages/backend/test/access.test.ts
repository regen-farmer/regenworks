// Access rules for Grove-internal data. Run: pnpm --filter backend test
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeMoney, groveRole, hasRole } from "@rw/db/access.ts";
import { requireRole } from "../src/middleware/access.ts";

const publicUser = { isAdmin: false, roles: [] };
const field = { isAdmin: false, roles: ["grove-field"] };
const team = { isAdmin: false, roles: ["grove-team"] };
const admin = { isAdmin: false, roles: ["grove-admin"] };
const legacyAdmin = { isAdmin: true, roles: [] };

test("roles nest: admin > team > field", () => {
  assert.equal(groveRole(publicUser), null);
  assert.equal(groveRole(field), "grove-field");
  assert.equal(groveRole(team), "grove-team");
  assert.equal(groveRole(admin), "grove-admin");
  assert.ok(hasRole(admin, "grove-field") && hasRole(admin, "grove-team"));
  assert.ok(hasRole(team, "grove-field"));
  assert.ok(!hasRole(field, "grove-team"));
  assert.ok(!hasRole(publicUser, "grove-field"));
});

test("the old isAdmin flag counts as grove-admin", () => {
  assert.equal(groveRole(legacyAdmin), "grove-admin");
});

test("unknown role names give no access", () => {
  assert.equal(groveRole({ roles: ["admin", "grove-boss"] }), null);
});

test("only team and admin see money; field users don't", () => {
  assert.ok(!canSeeMoney(publicUser));
  assert.ok(!canSeeMoney(field));
  assert.ok(canSeeMoney(team));
  assert.ok(canSeeMoney(admin));
});

function run(user: unknown, role: Parameters<typeof requireRole>[0]) {
  let status = 200;
  let nextCalled = false;
  const res: any = {
    status(code: number) {
      status = code;
      return this;
    },
    send() {
      return this;
    },
  };
  requireRole(role)(
    { user, idToken: user ? { email_verified: true } : undefined } as any,
    res,
    () => {
      nextCalled = true;
    },
  );
  return { status, nextCalled };
}

test("requireRole: not logged in → 401", () => {
  assert.deepEqual(run(undefined, "grove-field"), { status: 401, nextCalled: false });
});

test("requireRole: public user → 403", () => {
  assert.deepEqual(run(publicUser, "grove-field"), { status: 403, nextCalled: false });
});

test("requireRole: field user can open field routes, not team routes", () => {
  assert.equal(run(field, "grove-field").nextCalled, true);
  assert.deepEqual(run(field, "grove-team"), { status: 403, nextCalled: false });
});

test("requireRole: team and admin pass team routes", () => {
  assert.equal(run(team, "grove-team").nextCalled, true);
  assert.equal(run(admin, "grove-team").nextCalled, true);
  assert.equal(run(legacyAdmin, "grove-team").nextCalled, true);
});

test("requireRole: unverified email → 401 even with a role", () => {
  let status = 200;
  const res: any = {
    status(code: number) {
      status = code;
      return this;
    },
    send() {
      return this;
    },
  };
  let nextCalled = false;
  requireRole("grove-field")(
    { user: admin, idToken: { email_verified: false } } as any,
    res,
    () => {
      nextCalled = true;
    },
  );
  assert.equal(status, 401);
  assert.equal(nextCalled, false);
});
