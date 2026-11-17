import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Đang tải">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-48" />
    </div>
  );
}
