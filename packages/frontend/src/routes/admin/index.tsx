import { Link, createFileRoute } from "@tanstack/solid-router";

function AdminView() {
  return (
    <div class="p-6">
      <Link class="  hover:text-blue-400 underline" to="./advisor-requests">
        Advisor Requests
      </Link>
      <br />
      <Link class=" hover:text-blue-400 underline" to="./farmer-advisor-survey">
        Farmer/Advisor Survey
      </Link>
    </div>
  );
}

export const Route = createFileRoute("/admin/")({ component: AdminView });
