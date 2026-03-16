import { Link, useParams } from "@tanstack/solid-router";

export function ScenarioSideBar(props: any) {
  const params = useParams({ strict: false });

  // const navigate = useNavigate()

  return (
    <div
      class="d-flex"
      style={{
        grow: 1,
        overflow: "hidden",
      }}
    >
      <nav class="sidebar-nav">
        <div
          style={{
            "padding-left": "15px",
          }}
        >
          <br />
          <h4 class="h4">Scenario</h4>
          <ul class="navbar-nav sidebar">
            <li class="nav-item">
              {/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
              <Link
                class="nav-link"
                activeOptions={{ exact: true }}
                to={`/parcels/${params().parcelId}/layers/${params().layerId}/projects/${params().projectId}`}
              >
                Info
              </Link>
            </li>

            <li class="nav-item">
              {/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
              <Link
                class="nav-link"
                to={`/parcels/${params().parcelId}/layers/${params().layerId}/projects/${params().projectId}/financials`}
              >
                Financials
              </Link>
            </li>

            <li class="nav-item">
              {/* <A class='nav-link' href={`/users/${ currentUser._id }`}> */}
              <Link
                class="nav-link"
                to={`/parcels/${params().parcelId}/layers/${params().layerId}/projects/${params().projectId}/layout`}
              >
                Layout
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      <div
        style={{
          "overflow-y": "auto",
          "overflow-x": "hidden",
          width: "100%",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}
