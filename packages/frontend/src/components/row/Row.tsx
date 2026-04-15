import type { JSX } from "solid-js";

type RowProps = {
  children: JSX.Element | JSX.Element[];
  className?: string;
};

export function Row({ children, className = "" }: RowProps) {
  return <div class={`flex flex-wrap ${className}`}>{children}</div>;
}
