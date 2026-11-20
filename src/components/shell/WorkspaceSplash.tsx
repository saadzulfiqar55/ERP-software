import React from "react";
import { SovraLogo } from "@/components/ui/SovraLogo";

export interface WorkspaceSplashProps {
  /** Optional status message shown while the workspace hydrates or verifies the session. */
  message?: string;
}

/**
 * Shared pre-hydration and session-check splash screen rendered by both
 * `src/app/loading.tsx` (App Router Suspense fallback) and `AlbarkaMaterial3ERP`
 * while initial authentication state resolves.
 */
export function WorkspaceSplash({
  message = "Loading Sovra ERP Workspace…",
}: WorkspaceSplashProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen bg-md-surface flex flex-col items-center justify-center gap-4 px-6 text-md-on-surface"
    >
      <SovraLogo size={56} className="drop-shadow-sm" />
      <div className="text-center space-y-1">
        <div className="text-lg font-semibold tracking-tight text-md-on-surface">
          Sovra ERP
        </div>
        <div className="text-sm font-medium text-md-on-surface-variant">
          {message}
        </div>
      </div>
      <div className="w-40 h-1 rounded-full bg-md-primary-container overflow-hidden">
        <div className="w-1/2 h-full rounded-full bg-md-primary animate-pulse" />
      </div>
    </div>
  );
}

export default WorkspaceSplash;
