import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { createEffect, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";
import { getMongoDBUser } from "~/auth/useAuth";

type Role = "farmer" | "advisor";
type Action =
  | "farmer_buy-plan"
  | "farmer_contact-an-advisor"
  | "advisor_buy-plan";

type FarmerAdvisorSelectorProps = {
  isOpen: () => boolean;
  onSelect: (role: Role) => void;
  onClose: () => void;
};

export function FarmerAdvisorSelector({
  isOpen,
  onSelect,
  onClose,
}: FarmerAdvisorSelectorProps) {
  const [selectedRole, setSelectedRole] = createSignal<Role | null>(null);
  const [selectedAction, setSelectedAction] = createSignal<Action | null>(null);
  const [showOptions, setShowOptions] = createSignal(false);

  const navigate = useNavigate();

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

  function saveLog() {
    console.log("save");

    fetch(`${import.meta.env.VITE_BACKEND_URL}/farmer-advisor-survey`, {
      method: "post",
      ...apiFetchOptions(),
      body: JSON.stringify({
        role: selectedRole(),
        action: selectedAction(),
      }),
    });
  }

  const renderOptions = () => {
    if (selectedRole() === "farmer") {
      return (
        <div class="flex flex-col gap-4">
          <button
            onClick={async () => {
              setSelectedAction("farmer_contact-an-advisor");
              saveLog();
              if (myRequests().length > 0) {
                // Handle existing requests if needed.
              } else {
                const mongodbuserResponse = await fetch(
                  `${import.meta.env.VITE_BACKEND_URL}/advisor-requests`,
                  { method: "post", ...apiFetchOptions() }
                );
                const response = await mongodbuserResponse.json();
                console.log(response);
              }
              onClose();
            }}
            class="p-4 border rounded-lg cursor-pointer hover:border-primary"
          >
            <h3 class="text-lg font-semibold">Find a Local Advisor</h3>
            <p class="text-sm text-gray-600">
              Need help with your agroforestry system?
            </p>
          </button>
          <button
            onClick={() => {
              setSelectedAction("farmer_buy-plan");
              saveLog();
              navigate("/settings");
            }}
            class="p-4 border rounded-lg cursor-pointer hover:border-primary"
          >
            <h3 class="text-lg font-semibold">Design Your Own System</h3>
            <p class="text-sm text-gray-600">
              Choose a plan and design your agroforestry system yourself
            </p>
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={async () => {
          setSelectedAction("advisor_buy-plan");
          saveLog();
          navigate("/settings");
        }}
        class="p-4 border rounded-lg cursor-pointer hover:border-primary"
      >
        <h3 class="text-lg font-semibold">Choose a Plan</h3>
        <p class="text-sm text-gray-600">
          Grow and optimize your agroforestry advisory business
        </p>
      </button>
    );
  };

  return (
    <Dialog
      open={isOpen()}
      onOpenChange={() => {
        onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {showOptions() ? "Select an Option" : "Choose Your Role"}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {!showOptions() ? (
            <div class="flex flex-col gap-4 py-4">
              <button
                class={`p-4 border rounded-lg cursor-pointer transition-colors focus:outline-none ${
                  selectedRole() === "farmer"
                    ? "border-primary bg-primary/10"
                    : "border-gray-200 hover:border-primary"
                }`}
                onClick={() => {
                  setSelectedRole("farmer");
                  setShowOptions(true);
                }}
              >
                <h3 class="text-lg font-semibold">Farmer</h3>
                <p class="text-sm text-gray-600">
                  I own or manage a farm and want to get advice
                </p>
              </button>

              <button
                class={`p-4 border rounded-lg cursor-pointer transition-colors focus:outline-none ${
                  selectedRole() === "advisor"
                    ? "border-primary bg-primary/10"
                    : "border-gray-200 hover:border-primary"
                }`}
                onClick={() => {
                  setSelectedRole("advisor");
                  setShowOptions(true);
                }}
              >
                <h3 class="text-lg font-semibold">Farm Advisor</h3>
                <p class="text-sm text-gray-600">I work as a consultant</p>
              </button>
            </div>
          ) : (
            <div class="py-4">{renderOptions()}</div>
          )}

          <div class="flex justify-end gap-2 mt-4">
            {/* The Continue button has been removed as role selection now automatically moves to options */}
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

export default FarmerAdvisorSelector;
