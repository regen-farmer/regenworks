import {
  createEffect,
  createResource,
  createSignal,
  For,
  Show,
} from "solid-js";
import { apiFetchOptions } from "~/util/apiFetchOptions";

import { SessionProvider } from "~/auth/SessionProvider.tsx";
import { IUserSchema } from "@rw/db/schemas/user";

interface AdvisorRequest {
  _id: string;
  user: IUserSchema;
  email: string;
  status: "pending" | "resolved";
  creationDate: string;
}

export default function AdvisorRequests() {
  const [requests, setRequest] = createSignal<AdvisorRequest[]>([]);
  const [loading, setLoading] = createSignal<boolean>(true);

  createEffect(async () => {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/advisor-requests`,
      {
        method: "get",
        ...apiFetchOptions(),
      }
    );

    const data = await response.json();

    setRequest(data);
    setLoading(false);
  });

  return (
    <SessionProvider>
      <div class="p-6">
        <h1 class="text-2xl font-bold mb-6">Advisor Requests</h1>

        <div class="rounded-md border overflow-scroll">
          <div class="bg-gray-50 dark:bg-customdark1 px-4 py-3 grid grid-cols-4 font-medium">
            <div>RegenWorks UserID</div>
            {/* <div>ExternalID</div> */}
            <div>Email</div>
            <div>Date</div>
            <div>Status</div>
          </div>

          <Show
            when={!loading()}
            fallback={<div class="p-4">Loading requests...</div>}
          >
            <For each={requests()}>
                {(request) => (
                <div
                  class={`px-4 py-3 grid grid-cols-4 border-t ${
                  request.status === "pending"
                    ? "bg-yellow-100 text-yellow-800 dark:bg-[#6b5d2b] dark:text-yellow-100"
                    : "bg-green-100 text-green-800 dark:bg-[#375b32] dark:text-green-100"
                  }`}
                >
                  <div class=" flex flex-col justify-center ">
                    {request.user._id}
                  </div>
                  {/* <div class=" flex flex-col justify-center ">
                    {request.user.externalId}
                  </div> */}
                  <div class=" flex flex-col justify-center ">
                    {request.email}
                  </div>

                  <div class=" flex flex-col justify-center">
                      {new Date(request.creationDate).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                  </div>

                  <div class=" flex flex-col justify-center ">
                    {/* <span
                      class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${
                      request.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                    >
                      {request.status}
                    </span> */}
                    <select
                      class="rounded-sm p-1 ml-2 border border-gray-300 dark:border-gray-700"
                      value={request.status}
                      onChange={async (e) => {
                        const response = await fetch(
                          `${
                            import.meta.env.VITE_BACKEND_URL
                          }/advisor-requests/${request._id}`,
                          {
                            body: JSON.stringify({
                              status: e.currentTarget.value,
                            }),
                            method: "put",
                            ...apiFetchOptions(),
                          }
                        );
                        if (response.ok) {
                          const updatedRequest = await response.json();
                          setRequest((prev) =>
                            prev.map((r) =>
                              r._id === request._id ? updatedRequest : r
                            )
                          );
                        }
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              )}
            </For>
          </Show>

          <Show when={requests()?.length === 0}>
            <div class="p-4 text-center text-gray-500">
              No advisor requests found
            </div>
          </Show>
        </div>
      </div>
    </SessionProvider>
  );
}
