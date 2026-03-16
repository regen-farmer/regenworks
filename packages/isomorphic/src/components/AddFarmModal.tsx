import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Show, createSignal } from "solid-js";
import { createEffect } from "solid-js";

import { modes } from "~/routes/index.tsx";

import { useNavigate } from "@tanstack/solid-router";
import { allowFarmCreation } from "~/auth/useAuth.tsx";
import type { parcelPayload } from "~/routes/index.tsx";

type AddFarmModalProps = {
  mode: () => modes;
  setParcelPayload: (prop: string, payload: any) => void;
  parcelPayload: parcelPayload;
  enterDragMode: () => void;
  enderDefaultMode: () => void;
  cancelIndex: () => void;
  isEditing: () => boolean;
  setIsEditing: (isEditing: boolean) => void;
};

export function AddFarmModal({
  mode,
  setParcelPayload,
  parcelPayload,
  enterDragMode,
  enderDefaultMode,
  cancelIndex,
  isEditing,
  setIsEditing,
}: AddFarmModalProps) {
  const [nameError, setNameError] = createSignal<string>("");
  const [locationError, setLocationError] = createSignal<string>("");
  const [submitDisabled, setSubmitDisabled] = createSignal(false);

  createEffect(() => {
    if (mode() !== modes.addFarm) return;
    const input = document.getElementById("search_input");
    // @ts-ignore
    new google.maps.places.Autocomplete(input);

    setTimeout(() => {
      const pacContainer = document.querySelector(".pac-container");
      const modal = document.querySelector(".dialog__content");
      if (!pacContainer) {
        console.log("pacContainer not found");
        return;
      }
      if (!modal) {
        console.log("modal not found");
        return;
      }

      modal.appendChild(pacContainer);
    }, 1000);
  });

  const navigate = useNavigate();

  if (!allowFarmCreation()) {
    navigate({ to: "/" });
  }

  function submit() {
    setSubmitDisabled(true);
    checkErrors();
    if (!nameError() && !locationError()) {
      enterDragMode();
      setNameError("");
      setLocationError("");
    }
    setSubmitDisabled(false);
  }

  function checkErrors() {
    if (!parcelPayload.name) {
      console.log(parcelPayload.name);
      setNameError("Please enter a name");
    } else {
      setNameError("");
    }
    console.log("parcel location: ", parcelPayload.location);
    if (!parcelPayload.location) {
      console.log(parcelPayload.name);
      setLocationError("Please enter a location");
    } else {
      setLocationError("");
    }
  }

  function cancel() {
    setLocationError("");
    setNameError("");
    cancelIndex();
  }

  addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      submit();
    }
  });

  return (
    <div>
      <Show when={mode() === modes.addFarm}>
        <Dialog open={mode() === modes.addFarm} onOpenChange={cancel}>
          <DialogContent
            onPointerDownOutside={() => {
              cancel();
              enderDefaultMode();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Show when={isEditing() === true} fallback={"Create farm"}>
                  {"Edit farm"}
                </Show>
              </DialogTitle>
            </DialogHeader>
            <DialogDescription>
              <div class="form-group">
                <label for="formGroupExampleInput">Name</label>
                <input
                  type="text"
                  class="form-control w-full  p-1 rounded-sm border-zinc-400 border"
                  name="parcel[name]"
                  placeholder="What is the farm called?"
                  disabled={submitDisabled()}
                  value={parcelPayload.name}
                  onInput={(e: any) => {
                    setParcelPayload("name", e.target.value);
                  }}
                  onFocusOut={(e: any) => {
                    setParcelPayload("name", e.target.value);
                  }}
                />
                <Show when={nameError()}>
                  <p class="error">{nameError()}</p>
                </Show>
              </div>
              <div class="form-group dialog__content relative ">
                <label for="formGroupExampleInput">Address</label>
                <input
                  type="text"
                  class="form-control w-full  p-1 rounded-sm border-zinc-400 border"
                  name="parcel[location]"
                  id="search_input"
                  placeholder="Where is the farm located?"
                  disabled={submitDisabled()}
                  value={parcelPayload.location}
                  onInput={(e: any) => {
                    setParcelPayload("location", e.target.value);
                  }}
                  onFocusOut={(e: any) => {
                    setParcelPayload("location", e.target.value);
                  }}
                />
              </div>
              <Show when={locationError()}>
                <p class="error">{locationError()}</p>
              </Show>
              <br />
              <div
                class="form-group"
                style={{
                  display: "flex",
                  "justify-content": "space-between",
                }}
              >
                <button
                  type="button"
                  class="rounded-sm p-1 my-2 btn-default"
                  disabled={submitDisabled()}
                  onClick={() => {
                    cancel();
                    setIsEditing(false);
                    enderDefaultMode();
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-sm p-1 my-2 ml-2 btn-default"
                  disabled={submitDisabled()}
                  onClick={() => submit()}
                >
                  Adjust position on map
                </button>
              </div>
            </DialogDescription>
          </DialogContent>
        </Dialog>
      </Show>
    </div>
  );
}

export default AddFarmModal;
