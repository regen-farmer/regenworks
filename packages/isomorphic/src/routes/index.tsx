import { type Component, For, Match, Show, Switch, createResource } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { allowFarmCreation } from "~/auth/useAuth.tsx";
import type { ParcelDocument } from "@rw/db/schemas/parcel.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { createSignal } from "solid-js";
import { AddFarmModal } from "~/components/AddFarmModal.tsx";
import MLMap from "~/components/Map.tsx";
import { createStore } from "solid-js/store";

async function postParcel(payload: parcelPayload) {
  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/parcels`, {
    body: JSON.stringify({ parcel: payload }),
    method: "post",
    ...apiFetchOptions(),
  });
  return await response.json();
}

async function updateParcel(payload: parcelPayload) {
  const id = payload.id;
  payload.id = undefined;
  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/parcels/${id}`, {
    body: JSON.stringify({ parcel: payload }),
    method: "put",
    ...apiFetchOptions(),
  });
  return await response.json();
}

async function getGeoCodeFromLocation(location: string): Promise<[number, number]> {
  const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/geocoding`, {
    body: JSON.stringify({ address: location }),
    method: "post",
    ...apiFetchOptions(),
  });

  if (response.status == 500) {
    throw "Error while geocoding";
  }

  return await response.json();
}

export enum modes {
  default = 0,
  dragMode = 1,
  addFarm = 2,
}

export type parcelPayload = {
  name: string | undefined;
  location: string | undefined;
  lat: number | undefined;
  lng: number | undefined;
  id?: string;
};

const RouteViewHome: Component = () => {
  const [data, { refetch }] = createResource<{
    parcels: ParcelDocument[];
  }>(async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/parcels`, apiFetchOptions());

    return await response.json();
  });

  const navigate = useNavigate();

  const [mode, setMode] = createSignal<modes>(modes.default);
  const [isEditing, setIsEditing] = createSignal<boolean>(false);
  const [parcelPayload, setParcelPayload] = createStore<parcelPayload>({
    name: "",
    location: "",
    lng: undefined,
    lat: undefined,
  });
  const [coordinates, setCoordinates] = createSignal<[number, number]>();
  const [geocodingFailed, setGeocodingFailed] = createSignal<boolean>(false);

  async function enterDefaultMode() {
    if (parcelPayload.name && parcelPayload.location && parcelPayload.lng && parcelPayload.lat) {
      // await postParcel(parcelPayload);
      await refetch();
    }
    setMode(modes.default);
  }

  function enterAddFarmMode() {
    setMode(modes.addFarm);
  }

  async function enterDragMode() {
    setGeocodingFailed(false);
    if (parcelPayload.location && !isEditing()) {
      try {
        const result = await getGeoCodeFromLocation(parcelPayload.location);
        setCoordinates(result);
        setMode(modes.dragMode);
      } catch (err) {
        console.log("Couldn't geocode, entering manual placement mode", err);
        setGeocodingFailed(true);
        setMode(modes.dragMode);
      }
    } else {
      setCoordinates([parcelPayload.lng!, parcelPayload.lat!]);
      setMode(modes.dragMode);
    }
  }

  function enterEditMode(parcel: ParcelDocument) {
    setIsEditing(true);
    setMode(modes.addFarm);

    setParcelPayload({
      name: parcel.name,
      location: parcel.location,
      lng: Number(parcel.lng),
      lat: Number(parcel.lat),
      id: parcel._id,
    });
  }

  function cancel() {
    setParcelPayload({
      name: "",
      location: "",
      lng: undefined,
      lat: undefined,
      id: undefined,
    });
    setMode(modes.default);
    setIsEditing(false);
  }

  async function submitAndGoToDefaultMode() {
    if (isEditing()) {
      await updateParcel(parcelPayload);
      setIsEditing(false);
    } else {
      const newParcel = await postParcel(parcelPayload);
      navigate(`/parcels/${newParcel._id}`);
    }

    setParcelPayload({
      name: "",
      location: "",
      lng: undefined,
      lat: undefined,
      id: undefined,
    });

    setMode(modes.default);
    refetch();
  }

  return (
    <>
      <AddFarmModal
        mode={mode}
        setParcelPayload={setParcelPayload}
        parcelPayload={parcelPayload}
        enterDragMode={enterDragMode}
        enderDefaultMode={enterDefaultMode}
        cancelIndex={cancel}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
      />
      <Show when={data() && !data.loading} fallback={<p>no data</p>}>
        {/* <p>Doneloading: {JSON.stringify(data())} </p> */}

        <MLMap
          enterDefaultMode={enterDefaultMode}
          data={data}
          mode={mode}
          setParcelPayload={setParcelPayload}
          coordinates={coordinates}
          geocodingFailed={geocodingFailed}
        />

        <Switch>
          <Match when={mode() === modes.default}>
            <div
              style={{
                background: "rgba(0,0,0,0.4)",
                "border-radius": "10px",
                position: "fixed",
                "z-index": 10,
                color: "white",
                right: "10px",
                bottom: "10px",
                padding: "10px",
                "min-width": "12rem",
                width: "fit-content",
                "max-height": "600px",
                display: "flex",
                "flex-direction": "column",
              }}
            >
              <strong>
                <span>Farms</span>
              </strong>
              <div>
                <Show when={data()?.parcels}>
                  <div class="list-group rounded-sm">
                    <For each={data()?.parcels}>
                      {(parcel) => (
                        <div class="list-group-item list-group-item-action list-group-item-primary overlay-list-div">
                          <A href={`/parcels/${parcel._id}`} class="overlay-list-link">
                            {parcel.name}
                          </A>
                          <div>
                            <button
                              title="Edit farm"
                              type="button"
                              class={
                                "rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                              }
                              onClick={() => enterEditMode(parcel)}
                            >
                              <i class="fa-solid fa-pen" />
                            </button>

                            <button
                              title="Show farm on map"
                              type="button"
                              class={
                                "rounded-sm p-1 my-2 btn-default menu-btn list-group-button rounded-sm"
                              }
                              onClick={() => {
                                // Go to location of parcel
                                setCoordinates([Number(parcel.lng), Number(parcel.lat)]);
                              }}
                            >
                              <i class="fa-solid fa-crosshairs" />
                            </button>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
              <Show when={allowFarmCreation()}>
                <button
                  title={"Add new farm"}
                  type="button"
                  class={"rounded-sm p-1 mt-3 btn-default w-full"}
                  onClick={() => enterAddFarmMode()}
                >
                  Add new farm
                </button>
              </Show>
              <Show when={!allowFarmCreation()}>
                <button
                  title={"Upgrade plan to add more farms"}
                  type="button"
                  class={"rounded-sm p-1 mt-3 btn-default w-full"}
                  onClick={() => navigate("/settings")}
                >
                  Upgrade plan to add more farms
                </button>
              </Show>
            </div>
          </Match>
          <Match when={mode() === modes.dragMode}>
            <h1
              style={{
                background: "rgba(0,0,0,0.4)",
                "border-radius": "10px",
                position: "fixed",
                "z-index": 10,
                color: "white",
                top: "90px",
                "font-size": "20px",
                "text-align": "center",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "10px",
              }}
            >
              <Show
                when={!geocodingFailed()}
                fallback={"Address not found. Please place the marker on your farm's location."}
              >
                Drag the marker to the location of your farm
              </Show>
            </h1>
            <div
              style={{
                background: "rgba(0,0,0,0.4)",
                "border-radius": "10px",
                position: "fixed",
                "z-index": 10,
                color: "white",
                right: "10px",
                bottom: "10px",
                padding: "10px",
                "min-width": "12rem",
                "max-height": "90%",
              }}
            >
              <strong>
                <span>Location</span>
              </strong>
              <div />
              <button
                type="button"
                class={"rounded-sm p-1 my-2 btn-default"}
                onClick={() => submitAndGoToDefaultMode()}
                style={{ width: "100%" }}
              >
                Set location
              </button>
              <button
                type="button"
                class={"rounded-sm p-1 my-1 btn-danger"}
                onClick={() => {
                  cancel();
                }}
                style={{ width: "100%" }}
              >
                cancel
              </button>
            </div>
          </Match>
        </Switch>
      </Show>
    </>
  );
};

export default function () {
  return <RouteViewHome />;
}
