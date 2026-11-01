// Who may see Grove-internal data (prices, costs, margins, offers, clients,
// tree register). Shared by the backend and the web app's own server routes.
//
// Roles nest: grove-admin can do everything grove-team can, and grove-team can
// do everything grove-field can. Field users see trees and tasks, never money.
// Users with the older isAdmin flag count as grove-admin.

export const GROVE_ROLES = ["grove-field", "grove-team", "grove-admin"] as const;
export type GroveRole = (typeof GROVE_ROLES)[number];

type UserLike = { isAdmin?: boolean | null; roles?: readonly string[] | null } | null | undefined;

const RANK: Record<GroveRole, number> = { "grove-field": 1, "grove-team": 2, "grove-admin": 3 };

/** The highest Grove role a user has, or null for public users. */
export function groveRole(user: UserLike): GroveRole | null {
  if (!user) return null;
  let best: GroveRole | null = user.isAdmin ? "grove-admin" : null;
  for (const r of user.roles ?? []) {
    if ((GROVE_ROLES as readonly string[]).includes(r)) {
      const role = r as GroveRole;
      if (!best || RANK[role] > RANK[best]) best = role;
    }
  }
  return best;
}

/** True if the user has this role or a higher one. */
export function hasRole(user: UserLike, role: GroveRole): boolean {
  const mine = groveRole(user);
  return mine !== null && RANK[mine] >= RANK[role];
}

/** Field users may see trees and tasks, but no prices, costs or margins. */
export function canSeeMoney(user: UserLike): boolean {
  return hasRole(user, "grove-team");
}
