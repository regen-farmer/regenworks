import { SessionProvider } from "~/auth/SessionProvider";

export default function ParcelOutlet(props: any) {
	return <SessionProvider>{props.children}</SessionProvider>;
}
