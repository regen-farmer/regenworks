import express from "express";
import middleware from "../middleware/index.ts";
import FarmerAdvisorSurveyDocument from "@rw/db/schemas/farmer-advisor-survey.ts";
import type { Auth0IDToken } from "../app.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";

const router = express.Router();

router.post(
  "/farmer-advisor-survey",
  middleware.isLoggedIn,
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response
  ) => {
    try {
      const advisorRequest = new FarmerAdvisorSurveyDocument({
        user: req.user?._id,
        email: req.user?.email,
        creationDate: new Date(),
        role: req.body.role,
        action: req.body.action,
      });

      await advisorRequest.save();
      res.status(200).json({ message: "Success" });
    } catch (err) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
