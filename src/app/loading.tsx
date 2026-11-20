import { WorkspaceSplash } from "@/components/shell/WorkspaceSplash";

/** Route-level Next.js App Router Suspense fallback rendered prior to hydration/streaming. */
export default function Loading() {
  return <WorkspaceSplash />;
}
