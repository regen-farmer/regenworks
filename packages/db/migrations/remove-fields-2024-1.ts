import User from "../schemas/user";

import { connect } from "mongoose";

try {
	await connect(process.env.DATABASEURL as string); // CONNECTS TO MLAB MONGODB

	const users = await User.find({});
	for (const user of users) {
		// user.farmLimit = undefined;
		// user.haLimit = undefined;
		// user.hash = undefined;
		// user.username = undefined;
		// user.salt = undefined;
		// user.membership = undefined;
		// user.resetPasswordExpires = undefined;
		// user.resetPasswordToken = undefined;
		// user.currentProject = undefined;

		await user.save();
	}
} catch (error) {
	console.error("Error fetching users:", error);
}

console.log("DONE");
