// @refresh reload
import { Suspense } from "solid-js";
import { FileRoutes } from "@solidjs/start/router";
import { Router } from "@solidjs/router";
import "./app.css";
import { SessionProvider } from "@solid-mediakit/auth/client";

// Import mongoose models
import "@rw/db/schemas/activity";
import "@rw/db/schemas/animal";
import "@rw/db/schemas/area";
import "@rw/db/schemas/asset";
import "@rw/db/schemas/budget";
import "@rw/db/schemas/farmflow";
import "@rw/db/schemas/flow";
import "@rw/db/schemas/layer";
import "@rw/db/schemas/log";
import "@rw/db/schemas/note";
import "@rw/db/schemas/nursery";
import "@rw/db/schemas/nurseryproduct";
import "@rw/db/schemas/parcel";
import "@rw/db/schemas/posting";
import "@rw/db/schemas/practice";
import "@rw/db/schemas/project";
import "@rw/db/schemas/rateLimiterIP";
import "@rw/db/schemas/rotation";
import "@rw/db/schemas/row";
import "@rw/db/schemas/saptest";
import "@rw/db/schemas/sequence";
import "@rw/db/schemas/soiltest";
import "@rw/db/schemas/species";
import "@rw/db/schemas/system";
import "@rw/db/schemas/systemflow";
import "@rw/db/schemas/user";
import "@rw/db/schemas/variety";
import "@rw/db/schemas/well";

import { ThemeToggler } from "./theme";

export default function App() {
	return (
		<Router
			root={(props) => (
				<ThemeToggler>
					<Suspense>
						<SessionProvider>
							<div class="d-flex flex-column" style={{ height: "100%" }}>
								{props.children}
							</div>
						</SessionProvider>
					</Suspense>
				</ThemeToggler>
			)}
		>
			<FileRoutes />
		</Router>
	);
}
