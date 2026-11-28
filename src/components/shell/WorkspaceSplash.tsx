import React from "react";
import { StackLyraLogo } from "@/components/ui/StackLyraLogo";
import { ERP_VERSION_TAG } from "@/lib/version";

export interface WorkspaceSplashProps {
  /** Optional status message shown while the workspace hydrates or verifies the session. */
  message?: string;
}

/**
 * Shared Material 3 Expressive pre-hydration and session-check splash screen rendered by
 * both `src/app/loading.tsx` and `AlbarkaMaterial3ERP`.
 */
export function WorkspaceSplash({
  message = "Loading StackLyra ERP Workspace…",
}: WorkspaceSplashProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen m3-expressive-canvas flex flex-col items-center justify-center gap-5 px-6 text-md-on-surface"
    >
      <div className="p-2 rounded-[26px] bg-md-surface-container-lowest shadow-(--md-elevation-2) md-anim-rise">
        <StackLyraLogo size={60} />
      </div>
      <div className="text-center space-y-1.5">
        <div className="font-display text-2xl font-extrabold tracking-tight text-md-on-surface flex items-center justify-center gap-2.5">
          <span>StackLyra ERP</span>
          <span className="px-2.5 py-1 rounded-full bg-md-primary-container text-md-on-primary-container text-[11px] font-mono font-bold">
            {ERP_VERSION_TAG}
          </span>
        </div>
        <div className="text-sm font-medium text-md-on-surface-variant">
          {message}
        </div>
      </div>
      <div className="w-48 h-2 rounded-full bg-md-surface-container-high overflow-hidden p-[1px]">
        <div className="w-2/5 h-full rounded-full bg-md-primary md-expressive-indeterminate" />
      </div>
    </div>
  );
}

export default WorkspaceSplash;
