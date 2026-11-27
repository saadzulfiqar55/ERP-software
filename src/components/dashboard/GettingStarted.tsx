"use client";

import React, { useEffect, useState } from "react";
import { Check, ChevronRight, Rocket, X } from "lucide-react";
import { Card } from "@/components/ui/m3";

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
}

/**
 * First-run checklist for owners and managers. Steps tick themselves off from live workspace
 * data; the card hides itself once everything is done, or when the user dismisses it
 * (remembered per workspace on this device).
 */
export function GettingStarted({
  workspaceId,
  steps,
}: {
  workspaceId: string;
  steps: SetupStep[];
}) {
  const storageKey = `stacklyra:getting-started-hidden:${workspaceId}`;
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(storageKey) === "1");
    } catch {
      setHidden(false);
    }
  }, [storageKey]);

  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <Card className="md-anim-rise">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-2xl bg-md-tertiary-container text-md-on-tertiary-container flex items-center justify-center shrink-0">
          <Rocket className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-normal text-md-on-surface">
                Get your workspace ready
              </h2>
              <p className="text-sm text-md-on-surface-variant mt-0.5">
                {doneCount} of {steps.length} done
                {next ? ` · Next: ${next.title.toLowerCase()}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label="Hide setup checklist"
              title="Hide (you can finish these any time)"
              onClick={() => {
                try {
                  localStorage.setItem(storageKey, "1");
                } catch {}
                setHidden(true);
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-md-on-surface-variant hover:bg-md-surface-container-high"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3">
            <div
              className="w-full h-1.5 rounded-full bg-md-surface-container-high overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={doneCount}
            >
              <div
                className="h-full rounded-full bg-md-primary transition-all duration-500"
                style={{ width: `${(doneCount / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
        {steps.map((step, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={step.onAction}
              className={`w-full h-full text-left rounded-2xl p-3.5 flex items-start gap-3 group ${
                step.done
                  ? "bg-md-surface-container-low/60"
                  : "bg-md-surface-container-low hover:bg-md-secondary-container hover:shadow-(--md-elevation-1)"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold ${
                  step.done
                    ? "bg-md-success-container text-md-on-success-container"
                    : "bg-md-surface-container-lowest text-md-on-surface-variant shadow-(--md-elevation-1)"
                }`}
              >
                {step.done ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span
                  className={`block text-sm font-medium ${
                    step.done ? "text-md-on-surface-variant line-through" : "text-md-on-surface"
                  }`}
                >
                  {step.title}
                </span>
                <span className="block text-xs text-md-on-surface-variant mt-0.5">
                  {step.description}
                </span>
                {!step.done && (
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-md-primary">
                    {step.actionLabel}
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}
