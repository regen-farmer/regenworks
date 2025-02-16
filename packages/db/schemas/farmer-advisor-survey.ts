import mongoose from "mongoose";
import type { IUserSchema } from "./user.ts";
export interface IFarmerAdvisorSurveySchema {
  user: mongoose.HydratedDocument<IUserSchema>;
  email: string;
  requestDate: number;
  role: "advisor" | "farmer";
  action: "advisor_buy-plan" | "farmer_buy-plan" | "farmer_contact-an-advisor";
}

const FarmerAdvisorSurveySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  creationDate: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ["advisor", "farmer"],
    required: false,
  },
  action: {
    type: String,
    enum: ["advisor_buy-plan", "farmer_buy-plan", "farmer_contact-an-advisor"],
    required: false,
  },
});

const FarmerAdvisorSurvey =
  mongoose.models?.FarmerAdvisorSurvey ||
  mongoose.model<IFarmerAdvisorSurveySchema>(
    "FarmerAdvisorSurvey",
    FarmerAdvisorSurveySchema
  );

export default FarmerAdvisorSurvey;
export type FarmerAdvisorSurveyDocument = ReturnType<
  (typeof FarmerAdvisorSurvey)["hydrate"]
>;
