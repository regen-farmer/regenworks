// Grove-internal API. Everything under /internal is closed to public users:
// the guard below runs before any route in this file, so a new route can't be
// added unprotected by mistake. Routes that show money need grove-team on top.
import express from "express";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { canSeeMoney, groveRole } from "@rw/db/access.ts";
import { requireRole } from "../middleware/access.ts";

const router = express.Router();

router.use(requireRole("grove-field"));

// Who am I in Grove terms? The web app uses this to show the Grove menu.
router.get("/me", (req: express.Request & { user?: UserDocument }, res: express.Response) => {
  res.send({ role: groveRole(req.user), canSeeMoney: canSeeMoney(req.user) });
});

export default router;
