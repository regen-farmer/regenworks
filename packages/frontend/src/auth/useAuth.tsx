import { createSignal, onMount, Show } from "solid-js";
import NewUser from "~/auth/signup.tsx";
import { NavBar } from "~/components/NavBar.tsx";
import { GroveSideNav } from "~/components/GroveSideNav.tsx";
import { hasRole } from "@rw/db/access.ts";
import { apiFetchOptions } from "~/util/apiFetchOptions.ts";
import { getDevProdStatus, paymentPlan, StripeIds } from "~/util/paymentPlan.ts";
import { isElectron } from "~/util/platform.ts";

type ElectronSession = { auth0Token: string; auth0User: Record<string, unknown> } | null;
type ElectronAuth = {
  getSession: () => Promise<ElectronSession>;
  login: () => Promise<ElectronSession>;
  logout: () => Promise<void>;
  onSessionChanged: (cb: (session: ElectronSession) => void) => void;
};
function getElectronAuth(): ElectronAuth | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: { auth?: ElectronAuth } }).electronAPI;
  return api?.auth ?? null;
}

export const [getAuth0User, setAuth0User]: [any, any] = createSignal();
export const [getAuth0Token, setAuth0Token]: [any, any] = createSignal();
export const [getMongoDBUser, setMongoDBDBUser]: [any, any] = createSignal();
export const [getStripeCustomer, setStripeCustomer]: [any, any] = createSignal();

export const subscriptions = () => {
  if (getStripeCustomer()?.subscriptions) {
    if (getStripeCustomer()?.subscriptions.find((s: any) => s.status === "active")) {
      return getStripeCustomer()?.subscriptions[0];
    }
  } else {
    return [];
  }
};

export const allowFarmCreation = (): boolean => {
  if (getMongoDBUser) {
    return (
      getMongoDBUser()?.isAdmin ||
      // the Grove team keeps farms for its clients: no cap
      hasRole(getMongoDBUser(), "grove-field") ||
      (getMongoDBUser() && getMongoDBUser().parcels?.length < 1) ||
      (paymentPlan() === "advisor" && getMongoDBUser() && getMongoDBUser().parcels?.length < 100)
    );
  }

  return false;
};

export const currentSubscriptions = (): any[] => {
  return getStripeCustomer()?.subscriptions;
};

/**
 * The free plan's limits (presets and bearing only). Admins and the Grove
 * team design for clients, so they are never limited, with or without a
 * Stripe subscription.
 */
export const isFreemium = (): boolean => {
  const user = getMongoDBUser();
  if (user?.isAdmin || hasRole(user, "grove-field")) return false;
  return !(currentSubscriptions()?.length > 0);
};

export const isFarmer = (): boolean => {
  const isFarmerRole =
    currentSubscriptions()?.filter((sub) => {
      return sub.plan.product === StripeIds.farm.product[getDevProdStatus()];
    })?.length > 0;

  return isFarmerRole;
};

export function handleSignOut() {
  localStorage.removeItem("mongodbUser");
  localStorage.removeItem("stripeCustomer");
  const electronAuth = getElectronAuth();
  if (electronAuth) {
    electronAuth.logout();
    setAuth0Token(undefined);
    setAuth0User(undefined);
    setMongoDBDBUser(undefined);
    setStripeCustomer(undefined);
    return;
  }
  window.location.href = "/api/auth/signout";
}

async function hydrateMongoAndStripe() {
  // Get MongoDB user from localStorage (populated once, then reused across launches)
  let mongodbUser = localStorage.getItem("mongodbUser");
  // a remembered failed lookup ("null", "undefined") is no user: ask again
  if (mongodbUser === "null" || mongodbUser === "undefined") mongodbUser = null;
  if (!mongodbUser) {
    const mongodbuserResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/myuser`, {
      method: "get",
      ...apiFetchOptions(),
    });
    const responsejson = mongodbuserResponse.ok ? await mongodbuserResponse.json().catch(() => null) : null;
    mongodbUser = JSON.stringify(responsejson?.user ?? null);
    // only remember a real answer: a failed call (e.g. while logged out) would otherwise stick
    if (responsejson?.user) localStorage.setItem("mongodbUser", mongodbUser);
  }
  setMongoDBDBUser(JSON.parse(mongodbUser));

  // Get Stripe customer from localStorage
  let stripeCustomer = localStorage.getItem("stripeCustomer");
  if (!stripeCustomer) {
    const customerResponse = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/stripe/get_subscriptions`,
      {
        method: "POST",
        body: JSON.stringify({ user: mongodbUser }),
        ...apiFetchOptions(),
      },
    );
    const customerData = customerResponse.ok ? await customerResponse.json().catch(() => null) : null;
    stripeCustomer = JSON.stringify(customerData ?? {});
    // only remember a real answer, or a failed lookup shows "Free plan" until the next sign-out
    if (Array.isArray(customerData?.subscriptions)) localStorage.setItem("stripeCustomer", stripeCustomer);
  } else {
    // an answer remembered from a failed call (no subscriptions list): ask again next time
    try {
      if (!Array.isArray(JSON.parse(stripeCustomer)?.subscriptions)) localStorage.removeItem("stripeCustomer");
    } catch {
      localStorage.removeItem("stripeCustomer");
    }
  }
  setStripeCustomer(JSON.parse(stripeCustomer));
}

export const ShowAfterAuth = (props: any) => {
  onMount(async () => {
    // Electron path: the main process holds the token (PKCE flow, no cookies).
    const electronAuth = getElectronAuth();
    if (electronAuth) {
      const applySession = async (session: { auth0Token: string; auth0User: Record<string, unknown> } | null) => {
        if (!session) {
          setAuth0Token(undefined);
          setAuth0User(undefined);
          setMongoDBDBUser(undefined);
          setStripeCustomer(undefined);
          return;
        }
        setAuth0Token(session.auth0Token);
        setAuth0User(session.auth0User);
        await hydrateMongoAndStripe();
      };

      electronAuth.onSessionChanged(applySession);
      const current = await electronAuth.getSession();
      await applySession(current);
      return;
    }

    // Web path: the server sets auth0Token / auth0User cookies during Auth.js signin.
    let auth0Token = document.cookie.split("; ").find((row) => row.startsWith("auth0Token="));
    auth0Token = auth0Token?.split("=")[1];
    auth0Token = decodeURIComponent(decodeURIComponent(auth0Token ?? ""));

    if (auth0Token) {
      setAuth0Token(auth0Token);

      let auth0User = document.cookie.split("; ").find((row) => row.startsWith("auth0User="));
      auth0User = auth0User?.split("=")[1];
      auth0User = decodeURIComponent(decodeURIComponent(auth0User ?? ""));
      auth0User = JSON.parse(auth0User ?? "{}");
      setAuth0User(auth0User);

      await hydrateMongoAndStripe();
    }
  });

  return (
    <Show
      when={getAuth0User()}
      fallback={
        <>
          <NewUser />
        </>
      }
    >
      <Show
        when={getAuth0User()?.email_verified !== false}
        fallback={
          <>
            <br />
            <p>We've sent you a link to verify your email address. Click it and sign in again.</p>
            <button class="rounded-sm p-1 my-1 btn-sm btn-default" onClick={handleSignOut}>
              Log out
            </button>
          </>
        }
      >
        <Show when={getMongoDBUser()} fallback={<p>Connecting...</p>}>
          <NavBar />
          <Show when={hasRole(getMongoDBUser(), "grove-field")} fallback={props.children}>
            <div class="flex">
              <GroveSideNav />
              <div class="flex-1 min-w-0">{props.children}</div>
            </div>
          </Show>
        </Show>
      </Show>
    </Show>
  );
};
