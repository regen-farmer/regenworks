import type express from "express";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { hasRole, type GroveRole } from "@rw/db/access.ts";

type Req = express.Request & { user?: UserDocument };

/**
 * Only let users with this Grove role (or a higher one) through.
 * 401 when nobody is logged in, 403 when the user lacks the role.
 */
export function requireRole(role: GroveRole) {
  return (req: Req, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      res.status(401).send({ error: "You need to be logged in to do that" });
      return;
    }
    if (!hasRole(req.user, role)) {
      res.status(403).send({ error: "This is only available to the Grove team" });
      return;
    }
    next();
  };
}
