import { A } from "@solidjs/router";

export default function AdminView() {
  return (
    <div class="p-6">
      <A class="  hover:text-blue-400 underline" href="./advisor-requests">
        Advisor Requests
      </A>
      <br />
      <A class=" hover:text-blue-400 underline" href="./farmer-advisor-survey">
        Farmer/Advisor Survey
      </A>
    </div>
  );
}
