export default function Paper(props: { children: any }) {
  return (
    <div class="p-5 rounded-lg max-w-3xl bg-white text-black border border-gray-300 dark:bg-customdark1 mx-auto overflow-y-scroll max-h-[calc(100vh-120px)] my-4 dark:text-white dark:border-gray-700">
      {props.children}
    </div>
  );
}
