import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { createFileRoute } from "@tanstack/solid-router";
import { apiFetchOptions } from "~/util/apiFetchOptions";

import { IUserSchema } from "@rw/db/schemas/user";

interface AdvisorRequest {
  _id: string;
  user: IUserSchema;
  email: string;
  status: "pending" | "resolved";
  creationDate: string;
  layerCount: number;
  projectDetails?: string;
  phoneNumber?: string;
}

function AdvisorRequests() {
  const [requests, setRequest] = createSignal<AdvisorRequest[]>([]);
  const [loading, setLoading] = createSignal<boolean>(true);

  createEffect(async () => {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/advisor-requests`, {
      method: "get",
      ...apiFetchOptions(),
    });

    const data = await response.json();

    setRequest(data);
    setLoading(false);
  });

  return (
    <div class="p-6">
      <h1 class="text-2xl font-bold mb-6">Advisor Requests</h1>

      <div class="rounded-md border overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-gray-50 dark:bg-customdark1">
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">RegenWorks UserID</th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">Country</th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap"># Fields</th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">Email</th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">Phone</th>
              <th
                class="px-4 py-3 text-left font-medium"
                style="min-width: 300px; max-width: 500px;"
              >
                Project Details
              </th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">Date</th>
              <th class="px-4 py-3 text-left font-medium whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!loading()}
              fallback={
                <tr>
                  <td colspan="8" class="p-4">
                    Loading requests...
                  </td>
                </tr>
              }
            >
              <For each={requests()}>
                {(request) => (
                  <tr
                    class={`border-t ${
                      request.status === "pending"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-[#6b5d2b] dark:text-yellow-100"
                        : "bg-green-100 text-green-800 dark:bg-[#375b32] dark:text-green-100"
                    }`}
                  >
                    <td class="px-4 py-3 whitespace-nowrap">{request.user._id}</td>
                    <td class="px-4 py-3 whitespace-nowrap">{request.user.countryCode}</td>
                    <td class="px-4 py-3 whitespace-nowrap">{request.layerCount}</td>
                    <td class="px-4 py-3 whitespace-nowrap">{request.email}</td>
                    <td class="px-4 py-3 whitespace-nowrap">{request.phoneNumber || "-"}</td>
                    <td class="px-4 py-3" style="min-width: 300px; max-width: 500px;">
                      <div class="text-sm whitespace-pre-wrap break-words">
                        {request.projectDetails || "-"}
                      </div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      {new Date(request.creationDate).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                      <select
                        class="rounded-sm p-1 border border-gray-300 dark:border-gray-700"
                        value={request.status}
                        onChange={async (e) => {
                          const response = await fetch(
                            `${import.meta.env.VITE_BACKEND_URL}/advisor-requests/${request._id}`,
                            {
                              body: JSON.stringify({
                                status: e.currentTarget.value,
                              }),
                              method: "put",
                              ...apiFetchOptions(),
                            },
                          );
                          if (response.ok) {
                            const updatedRequest = await response.json();
                            setRequest((prev) =>
                              prev.map((r) => (r._id === request._id ? updatedRequest : r)),
                            );
                          }
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Show when={!loading() && requests()?.length === 0}>
          <div class="p-4 text-center text-gray-500">No advisor requests found</div>
        </Show>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/advisor-requests/")({ component: AdvisorRequests });
