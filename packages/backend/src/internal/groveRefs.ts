// Shared checks for links between Grove records: which users are Grove
// staff, and which farms are kept under a Grove account (never a public
// user's farm).
import mongoose from "mongoose";
import Parcel from "@rw/db/schemas/parcel.ts";
import User from "@rw/db/schemas/user.ts";
import { GROVE_ROLES } from "@rw/db/access.ts";

/** Ids of users with a Grove role. */
export async function groveUserIds(): Promise<string[]> {
  const users: any[] = await User.find({ $or: [{ isAdmin: true }, { roles: mongoose.trusted({ $in: [...GROVE_ROLES] }) }] })
    .select("_id")
    .lean();
  return users.map((u) => String(u._id));
}

/** Only farms kept under a Grove account can be linked (not public users' farms). */
export async function farmIsGroves(farmId: string) {
  const farm: any = await Parcel.findById(farmId).select("owner").lean();
  if (!farm?.owner?.id) return false;
  return (await groveUserIds()).includes(String(farm.owner.id));
}
