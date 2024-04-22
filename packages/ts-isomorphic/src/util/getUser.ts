// import { storage } from "~/auth/session";
// import User, { type UserDocument } from "~/models/user";

// export async function getMongoUserFromRequest(request: Request) {
//   const cookie = request.headers.get("Cookie") ?? "";
//   const session = await storage.getSession(cookie);
//   const userInfo: UserDocument = session.get("userInfo");
//   return await User.findOne({ email: userInfo.email }).exec();
// }
