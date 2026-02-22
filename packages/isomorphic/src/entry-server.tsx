// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => {
  return (
    <StartServer
      document={({ assets, children, scripts }) => (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.ico" />

            <title>RegenWorks - Agroforestry planning</title>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />

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

            {/* <!-- Font Awesome --> */}
            <link href="https://use.fontawesome.com/releases/v6.4.0/css/all.css" rel="stylesheet" />
            {/*
<Link
  href="https://cdnjs.cloudflare.com/ajax/libs/mdb-ui-kit/6.1.0/mdb.min.css"
  rel="stylesheet"
/> */}

            <link rel="shortcut icon" type="image/png" href="/images/icon.png" />

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

            <meta name="viewport" content="width=device-width, initial-scale=1" />

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
