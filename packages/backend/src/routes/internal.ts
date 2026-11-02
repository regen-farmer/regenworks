// Grove-internal API. Everything under /internal is closed to public users:
// the guard below runs before any route in this file, so a new route can't be
// added unprotected by mistake. Routes that show money need grove-team on top.
import express from "express";
import type { UserDocument } from "@rw/db/schemas/user.ts";
import { canSeeMoney, groveRole } from "@rw/db/access.ts";
import { requireRole } from "../middleware/access.ts";
import pricebookRoutes from "../internal/pricebookRoutes.ts";
import offerRoutes from "../internal/offerRoutes.ts";
import projectRoutes from "../internal/projectRoutes.ts";
import { clientRouter, dealRouter, funnelRouter } from "../internal/dealRoutes.ts";
import scorecardRoutes from "../internal/scorecardRoutes.ts";
import supplyRoutes from "../internal/supplyRoutes.ts";
import valueChainRoutes from "../internal/valueChainRoutes.ts";

const router = express.Router();

router.use(requireRole("grove-field"));

// Who am I in Grove terms? The web app uses this to show the Grove menu.
router.get("/me", (req: express.Request & { user?: UserDocument }, res: express.Response) => {
  res.send({ role: groveRole(req.user), canSeeMoney: canSeeMoney(req.user) });
});

// Prices and costs: grove-team and up (field users never see money).
router.use("/pricebook", requireRole("grove-team"), pricebookRoutes);
router.use("/offers", requireRole("grove-team"), offerRoutes);
// A · Clients & deals: client contacts and deal values, grove-team only.
router.use("/funnels", requireRole("grove-team"), funnelRouter);
router.use("/deals", requireRole("grove-team"), dealRouter);
router.use("/clients", requireRole("grove-team"), clientRouter);
// Dashboard scorecard: money, grove-team only.
router.use("/scorecard", requireRole("grove-team"), scorecardRoutes);
// Forward-order supply: grove-team only.
router.use("/supply", requireRole("grove-team"), supplyRoutes);
// Library → Value chains: equipment catalogue (with prices) and processing lines, grove-team only.
router.use("/value-chains", requireRole("grove-team"), valueChainRoutes);
// Dashboard: field users see their assigned projects (no money); see projectRoutes.ts.
router.use("/projects", projectRoutes);

export default router;
