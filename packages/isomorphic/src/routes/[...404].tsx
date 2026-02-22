import { HttpStatusCode } from "@solidjs/start";

export default function NotFound() {
  return (
    <main>
      <HttpStatusCode code={404} />
      <h1 class="h1">Page Not Found</h1>
    </main>
  );
}

// import { useNavigate } from "@solidjs/router";

// export function NotFound() {
//   const navigate = useNavigate();
//   navigate("/");
// }

// export default NotFound;
