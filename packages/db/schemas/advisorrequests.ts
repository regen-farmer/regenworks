import mongoose from "mongoose";
import type { IUserSchema } from "./user.ts";
export interface IAdvisorRequestSchema {
  user: mongoose.HydratedDocument<IUserSchema>;
  email: string;
  requestDate: number;
  status: 'pending' | 'resolved';
  projectDetails?: string;
  phoneNumber?: string;
}

const AdvisorRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  email: {
    type: String,
    required: true
  },
  creationDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'resolved'],
    required: true
  },
  projectDetails: {
    type: String,
    required: false
  },
  phoneNumber: {
    type: String,
    required: false
  }
});

const AdvisorRequest = mongoose.models?.AdvisorRequest || mongoose.model<IAdvisorRequestSchema>("AdvisorRequest", AdvisorRequestSchema);

export default AdvisorRequest;
export type AdvisorRequestDocument = ReturnType<(typeof AdvisorRequest)["hydrate"]>;