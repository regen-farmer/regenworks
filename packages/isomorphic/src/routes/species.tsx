import { SessionProvider } from "~/auth/SessionProvider.tsx";

export default function ParcelOutlet(props: any) {
	return <SessionProvider>{props.children}</SessionProvider>;
}
