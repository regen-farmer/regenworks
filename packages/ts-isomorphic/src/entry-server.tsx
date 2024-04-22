// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => {
	return (
		<StartServer
			document={({ assets, children, scripts }) => (
				<html lang="en">
					<head>
						<meta charset="utf-8" />
						<meta
							name="viewport"
							content="width=device-width, initial-scale=1"
						/>
						<link rel="icon" href="/favicon.ico" />

						<title>RegenWorks - Agroforestry planning</title>
						<meta charset="utf-8" />
						<meta
							name="viewport"
							content="width=device-width, initial-scale=1"
						/>

						<meta
							name="description"
							content="RegenWorks by Regen Farmer makes it easy to implement and manage regenerative agriculture."
						/>
						<meta
							name="keywords"
							content="regenerative agriculture management app software assessment tool implementation open data"
						/>

						{/* <!-- Google Font --> */}
						<link
							href="https://fonts.googleapis.com/css?family=Open+Sans:400,700"
							rel="stylesheet"
						/>

						{/* <!-- Boostrap CSS --> */}
						<link
							href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css"
							rel="stylesheet"
							integrity="sha384-GLhlTQ8iRABdZLl6O3oVMWSktQOp6b7In1Zl3/Jr59b6EGGoI1aFkw7cmDA6j6gD"
							crossorigin="anonymous"
						/>
						<script
							src="https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.6/dist/umd/popper.min.js"
							integrity="sha384-oBqDVmMz9ATKxIep9tiCxS/Z9fNfEXiDAYTujMAeBAsjFuCZSmKbSSUnQlmh/jp3"
							crossorigin="anonymous"
						/>
						<script
							src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.min.js"
							integrity="sha384-mQ93GR66B00ZXjt0YO5KlohRA5SY2XofN4zfuZxLkoj1gXtW8ANNCe9d5Y3eG5eD"
							crossorigin="anonymous"
						/>

						{/* <!-- Font Awesome --> */}
						<link
							href="https://use.fontawesome.com/releases/v6.4.0/css/all.css"
							rel="stylesheet"
						/>
						{/* 
<Link
  href="https://cdnjs.cloudflare.com/ajax/libs/mdb-ui-kit/6.1.0/mdb.min.css"
  rel="stylesheet"
/> */}

						{/* <!-- Custom Stylesheet --> */}
						<link
							rel="stylesheet"
							type="text/css"
							href="/stylesheets/style.css"
						/>

						<link
							rel="shortcut icon"
							type="image/png"
							href="/images/icon.png"
						/>

						{/* <!-- Google Maps JavaScript Library --> */}
						<script
							type="text/javascript"
							// src={`https://maps.googleapis.com/maps/api/js?libraries=places&key=${ import.meta.env.VITE_GEOCODER_API_KEY }&callback=activatePlaceSearch`}
							src={`https://maps.googleapis.com/maps/api/js?libraries=places&key=${
								import.meta.env.VITE_GEOCODER_API_KEY
							}`}
						/>

						{/* <!-- Set Charset to UTF-8 --> */}
						<meta charset="UTF-8" />

						<meta
							name="viewport"
							content="width=device-width, initial-scale=1"
						/>

						{assets}
					</head>
					<body>
						<div id="app">{children}</div>
						{scripts}
					</body>
				</html>
			)}
		/>
	);
});
