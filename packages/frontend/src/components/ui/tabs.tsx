import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TabsPrimitive from "@kobalte/core/tabs";

import { cn } from "~/lib/utils";

const Tabs = TabsPrimitive.Root;

type TabsListProps<T extends ValidComponent = "div"> = TabsPrimitive.TabsListProps<T> & {
  class?: string | undefined;
};

const TabsList = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsListProps<T>>,
) => {
  const [local, others] = splitProps(props as TabsListProps, ["class"]);
  return (
    <TabsPrimitive.List
      class={cn(
        "inline-flex h-10 gap-2 items-center justify-center rounded-md  dark:text-gray-300 text-gray-800",
        local.class,
      )}
      {...others}
    />
  );
};

type TabsTriggerProps<T extends ValidComponent = "button"> = TabsPrimitive.TabsTriggerProps<T> & {
  class?: string | undefined;
};

const TabsTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TabsTriggerProps<T>>,
) => {
  const [local, others] = splitProps(props as TabsTriggerProps, ["class"]);
  return (
    <TabsPrimitive.Trigger
      class={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-gray-900 transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-gray-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-zinc-400 text-zinc-400 hover:border-zinc-800 hover:bg-white hover:text-black dark:hover:bg-zinc-800 dark:hover:text-white dark:border dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 data-selected:border-zinc-800 data-selected:bg-white data-selected:text-black dark:data-selected:bg-zinc-800 dark:data-selected:text-white dark:data-selected:border-zinc-500",
        local.class,
      )}
      {...others}
    />
  );
};

type TabsContentProps<T extends ValidComponent = "div"> = TabsPrimitive.TabsContentProps<T> & {
  class?: string | undefined;
};

const TabsContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsContentProps<T>>,
) => {
  const [local, others] = splitProps(props as TabsContentProps, ["class"]);
  return (
    <TabsPrimitive.Content
      class={cn(
        "mt-2 ring-offset-background bg-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-customdark1 dark:border-zinc-700 dark:border-1 border border-zinc-500 rounded-md p-3 dark:rounded-md",
        local.class,
      )}
      {...others}
    />
  );
};

type TabsIndicatorProps<T extends ValidComponent = "div"> = TabsPrimitive.TabsIndicatorProps<T> & {
  class?: string | undefined;
};

const TabsIndicator = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, TabsIndicatorProps<T>>,
) => {
  const [local, others] = splitProps(props as TabsIndicatorProps, ["class"]);
  return (
    <TabsPrimitive.Indicator
      class={cn(
        "duration-250ms absolute transition-all data-[orientation=horizontal]:-bottom-px data-[orientation=vertical]:-right-px data-[orientation=horizontal]:h-[2px] data-[orientation=vertical]:w-[2px]",
        local.class,
      )}
      {...others}
    />
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent, TabsIndicator };
