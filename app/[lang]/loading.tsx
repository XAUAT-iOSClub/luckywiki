export default function Loading() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-primary/10"
    >
      <div className="route-progress-bar h-full w-full bg-primary" />
    </div>
  );
}
