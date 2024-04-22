import { createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import "./splitview.css";

interface SplitViewProps {
	children: JSX.Element[];
	startPercent?: number;
}

function SplitView({ children, startPercent = 50 }: SplitViewProps) {
	let container: HTMLDivElement;
	let resizer: HTMLDivElement;
	let leftPane: HTMLDivElement;
	let rightPane: HTMLDivElement;

	const [isResizing, setIsResizing] = createSignal(false);

	const onMouseDown = (e: MouseEvent) => {
		setIsResizing(true);
		e.preventDefault();
	};

	const onMouseMove = (e: MouseEvent) => {
		if (!isResizing()) return;
		const dx = e.clientX - container.getBoundingClientRect().left;
		leftPane.style.width = `${dx}px`;
		rightPane.style.width = `${container.getBoundingClientRect().width - dx}px`;
		resizer.style.left = `${dx}px`;
	};

	const onMouseUp = () => {
		setIsResizing(false);
	};

	const bindContainer = (el: HTMLDivElement) => {
		container = el;
	};

	const bindResizer = (el: HTMLDivElement) => {
		resizer = el;
	};

	const bindLeftPane = (el: HTMLDivElement) => {
		leftPane = el;
	};

	const bindRightPane = (el: HTMLDivElement) => {
		rightPane = el;
	};

	onMount(() => {
		const initialLeftWidth =
			container.getBoundingClientRect().width * (startPercent / 100);
		leftPane.style.width = `${initialLeftWidth}px`;
		rightPane.style.width = `${
			container.getBoundingClientRect().width - initialLeftWidth
		}px`;
		resizer.style.left = `${initialLeftWidth}px`;

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);


		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	});

	return (
		<div class="splitViewContainer" ref={bindContainer}>
			<div class="splitViewPane" ref={bindLeftPane}>
				{children[0]}
			</div>
			<div
				class="splitViewResizer"
				ref={bindResizer}
				onMouseDown={onMouseDown}
			/>
			<div class="splitViewPane" ref={bindRightPane}>
				{children[1]}
			</div>
		</div>
	);
}

export default SplitView;
