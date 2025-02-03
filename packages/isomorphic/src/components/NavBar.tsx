import { Show, createEffect, createMemo, createSignal } from "solid-js";
import {
  currentSubscription,
  getMongoDBUser,
  subscriptions,
} from "~/auth/useAuth.tsx";
import { ThemeSelect } from "./select/theme-select.tsx";
import { FarmSelect } from "./select/farm-select.tsx";
import { FieldSelect } from "./select/field-select.tsx";
import { ProjectSelect } from "./select/project-select.tsx";
import { A, useNavigate, useLocation } from "@solidjs/router";
import Tooltip from "@corvu/tooltip";
// import { ModeToggle } from "./ui/mode-toggle.tsx";
import {
  Breadcrumb,
  BreadcrumbSlash,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";

export function NavBar() {
  const navigate = useNavigate();
  // const params = useParams()

  const location = useLocation();

  const getParcelId = createMemo(() => {
    const pathSections = location.pathname.split("/");
    const parcelsIndex = pathSections.findIndex((value) => value === "parcels");

    const parcelId: string = pathSections[parcelsIndex + 1];
    return parcelId;
  });

  const getLayerId = createMemo(() => {
    const pathSections = location.pathname.split("/");
    const layersIndex = pathSections.findIndex((value) => value === "layers");

    const layerId: string = pathSections[layersIndex + 1];

    // console.log('LayerId', layerId)
    return layerId;
  });

  const [myRequests, setMyRequests] = createSignal([]);

  createEffect(async () => {
    if (getMongoDBUser()) {
      const myRequests = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/my-advisor-requests`,
        {
          method: "get",
          ...apiFetchOptions(),
        }
      );

      const response = await myRequests.json();

      setMyRequests(response);
    }
  });

  const getProjectId = createMemo(() => {
    const pathSections = location.pathname.split("/");
    const projectsIndex = pathSections.findIndex(
      (value) => value === "projects"
    );

    const projcetId: string = pathSections[projectsIndex + 1];

    // console.log('ProjectId', projcetId)
    return projcetId;
  });

  const freemium = createMemo<boolean>(() => {
    return !(currentSubscription()?.length > 0);
  });

  return (
    <nav class="flex items-center h-14 border-b border-zinc-300 dark:border-slate-600 bg-white dark:bg-customdark1">
      <div
        id="logotype"
        class="mx-3 cursor-pointer"
        onclick={() => {
          navigate("/");
        }}
      >
        <div class="logo-icon" />
      </div>

      <div class="flex-grow flex" id="navbarText">
        <Breadcrumb class="mr-auto">
          <BreadcrumbList>
            <Show when={getMongoDBUser() && subscriptions() && getParcelId()}>
              <BreadcrumbItem
                style={{
                  display: "flex",
                  "justify-content": "center",
                  "align-items": "center",
                }}
              >
                <FarmSelect />
                <A
                  title="Go to farm"
                  style={{ "margin-left": "5px" }}
                  href={getParcelId() ? `/parcels/${getParcelId()}` : ""}
                  end={true}
                >
                  <i class="fa-solid fa-house" />
                </A>
              </BreadcrumbItem>

              <Show when={getLayerId()}>
                <BreadcrumbItem
                  style={{
                    display: "flex",
                    "justify-content": "center",
                    "align-items": "center",
                  }}
                >
                  <BreadcrumbSlash />

                  <FieldSelect />
                  <A
                    title="Go to field"
                    style={{ "margin-left": "5px" }}
                    href={
                      getLayerId()
                        ? `/parcels/${getParcelId()}/layers/${getLayerId()}`
                        : `/parcels/${getParcelId()}`
                    }
                    end={true}
                  >
                    <i class="fa-solid fa-layer-group" />
                  </A>
                </BreadcrumbItem>

                <Show when={getProjectId()}>
                  <BreadcrumbItem
                    style={{
                      display: "flex",
                      "justify-content": "center",
                      "align-items": "center",
                    }}
                  >
                    <BreadcrumbSlash />

                    <ProjectSelect />
                    <A
                      title="Go to scenario"
                      style={{ "margin-left": "5px" }}
                      href={
                        getProjectId()
                          ? `/parcels/${getParcelId()}/layers/${getLayerId()}/projects/${getProjectId()}`
                          : `/parcels/${getParcelId()}/layers/${getLayerId()}`
                      }
                      end={true}
                    >
                      <i class="fa-solid fa-lightbulb" />
                    </A>
                  </BreadcrumbItem>
                </Show>
              </Show>
            </Show>
          </BreadcrumbList>
        </Breadcrumb>

        <ul class="flex items-center mx-3 gap-4">
          <Show when={getMongoDBUser()}>
            <Show when={freemium()}>
              <Tooltip
                placement="top"
                openDelay={200}
                floatingOptions={{
                  offset: 13,
                  flip: true,
                  shift: true,
                }}
              >
                <Tooltip.Anchor>
                  <Tooltip.Trigger>
                    <button
                      // @ts-ignore
                      disabled={myRequests().length > 0}
                      type="submit"
                      class={`rounded-sm p-1 mr-2 my-2 btn-default`}
                      onclick={async () => {
                        const mongodbuserResponse = await fetch(
                          `${
                            import.meta.env.VITE_BACKEND_URL
                          }/advisor-requests`,
                          { method: "post", ...apiFetchOptions() }
                        );
                        const response = await mongodbuserResponse.json();
                        console.log(response);
                      }}
                    >
                      {myRequests().length > 0
                        ? `You'll be contacted by email soon`
                        : "Contact an Advisor"}
                    </button>
                  </Tooltip.Trigger>
                </Tooltip.Anchor>
                <Tooltip.Portal>
                  <Tooltip.Content class="rounded-lg bg-white dark:bg-gray-900  dark:text-white px-3 py-2 font-medium data-open:animate-in data-open:fade-in-50% data-open:slide-in-from-bottom-1 data-closed:animate-out data-closed:fade-out-50% data-closed:slide-out-to-bottom-1">
                    Get contacted by an agriculture advisor.
                    <Tooltip.Arrow class="text-white dark:text-gray-900" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip>
            </Show>
            <li class="nav-item">
              <A class="nav-link" href={"/settings"}>
                <i class="fas fa-gear" /> Settings
              </A>
            </li>

            <li class="nav-item">
              <A
                title="Support"
                class="nav-link"
                target="_blank"
                href={"https://discord.gg/DqUZU7QNF5"}
              >
                <i class="fas fa-circle-info" /> Support
              </A>
            </li>
          </Show>
          <li>
            <span class="text-white">
              <ThemeSelect />
            </span>
          </li>
        </ul>
      </div>
    </nav>
  );
}
