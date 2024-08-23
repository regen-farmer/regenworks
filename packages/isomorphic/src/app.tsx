// @refresh reload
import { Suspense } from "solid-js";
import { FileRoutes } from "@solidjs/start/router";
import { Router } from "@solidjs/router";
import "./app.css";
import { SessionProvider } from "@solid-mediakit/auth/client";

// Import mongoose models
import "@rw/db/schemas/activity.ts";
import "@rw/db/schemas/animal.ts";
import "@rw/db/schemas/area.ts";
import "@rw/db/schemas/asset.ts";
import "@rw/db/schemas/budget.ts";
import "@rw/db/schemas/farmflow.ts";
import "@rw/db/schemas/flow.ts";
import "@rw/db/schemas/layer.ts";
import "@rw/db/schemas/log.ts";
import "@rw/db/schemas/note.ts";
import "@rw/db/schemas/nursery.ts";
import "@rw/db/schemas/nurseryproduct.ts";
import "@rw/db/schemas/parcel.ts";
import "@rw/db/schemas/posting.ts";
import "@rw/db/schemas/practice.ts";
import "@rw/db/schemas/project.ts";
import "@rw/db/schemas/rateLimiterIP.ts";
import "@rw/db/schemas/rotation.ts";
import "@rw/db/schemas/row.ts";
import "@rw/db/schemas/saptest.ts";
import "@rw/db/schemas/sequence.ts";
import "@rw/db/schemas/soiltest.ts";
import "@rw/db/schemas/species.ts";
import "@rw/db/schemas/system.ts";
import "@rw/db/schemas/systemflow.ts";
import "@rw/db/schemas/user.ts";
import "@rw/db/schemas/variety.ts";
import "@rw/db/schemas/well.ts";

import { ThemeToggler } from "./theme.tsx";
import { getCookie } from "vinxi/http";
import {
	ColorModeProvider,
	ColorModeScript,
	cookieStorageManagerSSR,
} from "@kobalte/core";
import { isServer } from "solid-js/web";

function getServerCookies() {
	"use server";
	const colorMode = getCookie("kb-color-mode");
	return colorMode ? `kb-color-mode=${colorMode}` : "";
}

export default function App() {
	const storageManager = cookieStorageManagerSSR(
		isServer ? getServerCookies() : document.cookie,
	);

	return (
		<Router
			root={(props) => (
				<>
					<ColorModeScript storageType={storageManager.type} />
					<ColorModeProvider storageManager={storageManager}>
						{/* <ThemeToggler> */}
							<Suspense>
								<SessionProvider>
									<div class="d-flex flex-column" style={{ height: "100%" }}>
										{props.children}
									</div>
								</SessionProvider>
							</Suspense>
						{/* </ThemeToggler> */}
					</ColorModeProvider>
				</>
			)}
		>
			<FileRoutes />
		</Router>
	);
}
