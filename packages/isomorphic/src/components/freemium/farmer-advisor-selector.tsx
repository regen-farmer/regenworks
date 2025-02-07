import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { apiFetchOptions } from "~/util/apiFetchOptions";

type Role = "farmer" | "advisor";

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
  const [showOptions, setShowOptions] = createSignal(false);

  const handleSelect = () => {
    setShowOptions(true);
  };

  const navigate = useNavigate();

  const renderOptions = () => {
    if (selectedRole() === "farmer") {
      return (
        <div class="flex flex-col gap-4">
          <div
            onclick={async () => {
              const mongodbuserResponse = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/advisor-requests`,
                { method: "post", ...apiFetchOptions() }
              );
              const response = await mongodbuserResponse.json();
              console.log(response);
              onClose();
            }}
            class="p-4 border rounded-lg cursor-pointer hover:border-primary"
          >
            <h3 class="text-lg font-semibold">Find a Local Advisor</h3>
            <p class="text-sm text-gray-600">
              Need help with your agroforestry system?
            </p>
          </div>
          <div
            onClick={() => {
              navigate("/settings");
            }}
            class="p-4 border rounded-lg cursor-pointer hover:border-primary"
          >
            <h3 class="text-lg font-semibold">Design Your Own System</h3>
            <p class="text-sm text-gray-600">
              Choose a plan and design your agroforestry system yourself
            </p>
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={() => {
          navigate("/settings");
        }}
        class="p-4 border rounded-lg cursor-pointer hover:border-primary"
      >
        <h3 class="text-lg font-semibold">Choose a Plan</h3>
        <p class="text-sm text-gray-600">
          Grow and optimize your agroforestry advisory business
        </p>
      </div>
    );
  };

  return (
    <Dialog open={isOpen()} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {showOptions() ? "Select an Option" : "Choose Your Role"}
          </DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {!showOptions() ? (
            <div class="flex flex-col gap-4 py-4">
              <div
                class={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedRole() === "farmer"
                    ? "border-primary bg-primary/10"
                    : "border-gray-200 hover:border-primary"
                }`}
                onClick={() => setSelectedRole("farmer")}
              >
                <h3 class="text-lg font-semibold">Farmer</h3>
                <p class="text-sm text-gray-600">
                  I own or manage a farm and want to get advice
                </p>
              </div>

              <div
                class={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedRole() === "advisor"
                    ? "border-primary bg-primary/10"
                    : "border-gray-200 hover:border-primary"
                }`}
                onClick={() => setSelectedRole("advisor")}
              >
                <h3 class="text-lg font-semibold">Farm Advisor</h3>
                <p class="text-sm text-gray-600">I work as a consultant</p>
              </div>
            </div>
          ) : (
            <div class="py-4">{renderOptions()}</div>
          )}

          <div class="flex justify-end gap-2 mt-4">
            <button
              class="px-4 py-2 border rounded-lg hover:bg-gray-100"
              onClick={() => {
                if (showOptions()) {
                  setShowOptions(false);
                } else {
                  onClose();
                }
              }}
            >
              {showOptions() ? "Back" : "Cancel"}
            </button>
            {!showOptions() && (
              <button
                class="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
                onClick={handleSelect}
                disabled={!selectedRole()}
              >
                Continue
              </button>
            )}
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

export default FarmerAdvisorSelector;
