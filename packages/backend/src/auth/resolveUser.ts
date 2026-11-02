// Turn a verified identity into a GroveWorks user account.
//
// Rules:
// 1. Known Auth0 id (sub) → that account.
// 2. Unknown sub, email verified by Auth0, and an account with that email
//    exists → link the account to this sub (same person, new login method).
// 3. Unknown sub, email NOT verified, and an account with that email exists
//    → no account (anonymous). Linking would let anyone take over an account
//    by signing up with someone else's address.
// 4. Otherwise → create a new account, atomically, so parallel first requests
//    from a new user don't trip over each other.
import type { Model } from "mongoose";
import type { VerifiedIdentity } from "./identify.ts";

// The few model methods we use, so tests can pass a small fake.
type UserModelLike = Pick<Model<any>, "findOne" | "findOneAndUpdate">;

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function resolveUser(identity: VerifiedIdentity | null, User: UserModelLike) {
  if (!identity?.sub) return null;
  const { sub, email, email_verified } = identity;

  const known = await User.findOne({ externalId: { $eq: sub } }).exec();
  if (known) return known;

  if (email) {
    const byEmail = await User.findOne({ email: { $eq: email } }).exec();
    if (byEmail) {
      if (!email_verified) {
        console.warn("Login with unverified email matching an existing account; not linked");
        return null;
      }
      byEmail.externalId = sub;
      await byEmail.save();
      return byEmail;
    }
  }

  const fields: Record<string, unknown> = {
    externalId: sub,
    registrationDate: Date.now(),
    isProject: true,
  };
  if (email) fields.email = email;
  try {
    return await User.findOneAndUpdate(
      { externalId: { $eq: sub } },
      { $setOnInsert: fields },
      { upsert: true, new: true },
    ).exec();
  } catch (err) {
    // Another request created the same account a moment earlier: use that one.
    if (isDuplicateKey(err)) return User.findOne({ externalId: { $eq: sub } }).exec();
    throw err;
  }
}
