// @refresh reload
import { Suspense } from "solid-js";
import { FileRoutes } from "@solidjs/start/router";
import { Router } from "@solidjs/router";
import "./app.css";
import { SessionProvider } from "@solid-mediakit/auth/client";

// Import mongoose models
import "./models/activity";
import "./models/animal";
import "./models/area";
import "./models/asset";
import "./models/budget";
import "./models/farmflow";
import "./models/flow";
import "./models/layer";
import "./models/log";
import "./models/note";
import "./models/nursery";
import "./models/nurseryproduct";
import "./models/parcel";
import "./models/posting";
import "./models/practice";
import "./models/project";
import "./models/rateLimiterIP";
import "./models/rotation";
import "./models/row";
import "./models/saptest";
import "./models/sequence";
import "./models/soiltest";
import "./models/species";
import "./models/system";
import "./models/systemflow";
import "./models/user";
import "./models/variety";
import "./models/well";

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
