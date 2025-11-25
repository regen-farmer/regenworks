import { IUserSchema } from "@rw/db/schemas/user";
import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetchOptions } from "~/util/apiFetchOptions";

interface AdvisorRequest {
  _id: string;
  user: IUserSchema;
  email: string;
  role?: string;
  action?: string;
  creationDate: string;
  layerCount: number;
}

export default function FarmerAdvisorSurvey() {
  const [entries, setEntries] = createSignal<AdvisorRequest[]>([]);
  const [loading, setLoading] = createSignal<boolean>(true);

  createEffect(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/farmer-advisor-survey`,
      {
        method: "get",
        ...apiFetchOptions(),
      }
    );

    const data = await response.json();

    setEntries(data);
    setLoading(false);
  });
  

  return (
    <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Farmer/Advisor Survey</h1>

    <div class="rounded-md border overflow-scroll">
              <div class="bg-gray-50 dark:bg-customdark1 px-4 py-3 grid grid-cols-7 font-medium">
                <div>RegenWorks UserID</div>
                {/* <div>ExternalID</div> */}
                <div>Country</div>
                <div># Fields</div>
                <div>Email</div>
                <div>Date</div>
                <div>Role</div>
                <div>Action</div>
              </div>
    
              <Show
                when={!loading()}
                fallback={<div class="p-4">Loading entries...</div>}
              >
                <For each={entries()}>
                  {(entry) => (
                    <div
                      class={`px-4 py-3 grid grid-cols-7 border-t  `}
                    >
                      <div class=" flex flex-col justify-center ">
                        {entry.user._id}
                      </div>
                      <div class=" flex flex-col justify-center ">
                        {entry.user.countryCode}
                      </div>

                      <div class=" flex flex-col justify-center ">
                        {entry.layerCount}
                      </div>
                      {/* <div class=" flex flex-col justify-center ">
                        {request.user.externalId}
                      </div> */}
                      <div class=" flex flex-col justify-center ">
                        {entry.email}
                      </div>
    
                        <div class=" flex flex-col justify-center ">
                        {new Date(entry.creationDate).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        </div>

                      <div class=" flex flex-col justify-center ">
                        {entry.role}
                      </div>

                      <div class=" flex flex-col justify-center ">
                        {entry.action}
                      </div>
    
    
                    </div>
                  )}
                </For>
              </Show>
    
              <Show when={entries()?.length === 0}>
                <div class="p-4 text-center text-gray-500">
                  No survey results found
                </div>
              </Show>
            </div>


      </div>
  );
}
