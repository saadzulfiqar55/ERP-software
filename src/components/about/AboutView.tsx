"use client";

import React from "react";
import { ArrowUpRight, CheckCircle2, Code2, Layers, ShieldCheck } from "lucide-react";
import { Card, PageHeader, StatusChip } from "@/components/ui/m3";
import { StackLyraLogo } from "@/components/ui/StackLyraLogo";
import {
  ERP_AUTHOR,
  ERP_RELEASES,
  ERP_RELEASE_STAGE,
  ERP_SOCIAL_LINKS,
  ERP_VERSION_POLICY,
  ERP_VERSION_TAG,
  SocialLinkItem,
} from "@/lib/version";

function SocialBrandIcon({ id }: { id: SocialLinkItem["id"] }) {
  switch (id) {
    case "github":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.11.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.11 3.06.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.27 5.68.42.36.79 1.07.79 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.67.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M19 3A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H19M18.5 18.5V13.2A3.26 3.26 0 0 0 15.24 9.94C14.39 9.94 13.4 10.46 12.92 11.24V10.13H10.13V18.5H12.92V13.57C12.92 12.8 13.54 12.17 14.31 12.17A1.4 1.4 0 0 1 15.71 13.57V18.5H18.5M6.88 8.56A1.68 1.68 0 0 0 8.56 6.88C8.56 5.95 7.81 5.19 6.88 5.19A1.69 1.69 0 0 0 5.19 6.88C5.19 7.81 5.95 8.56 6.88 8.56M8.27 18.5V10.13H5.5V18.5H8.27Z" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
          <path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3Z" />
        </svg>
      );
  }
}

const STACK_TAGS = [
  "Next.js 16 App Router",
  "React 19",
  "TypeScript 5",
  "Tailwind CSS v4",
  "Material Design 3",
  "PostgreSQL (Supabase)",
  "HS256 JWT + scrypt",
  "PRA e-IMS & Khata",
];

/**
 * Material Design 3 About view showcasing StackLyra ERP version state,
 * release methodology, stack overview, and creator social links.
 */
export default function AboutView() {
  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="About StackLyra ERP"
        subtitle="Platform release status, engineering stack, and creator links"
        actions={
          <div className="flex items-center gap-2">
            <StatusChip label={ERP_VERSION_TAG} variant="primary" />
            <StatusChip label={ERP_RELEASE_STAGE} variant="warning" />
          </div>
        }
      />

      {/* Brand Identity & Version Hero */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <StackLyraLogo size={64} className="shrink-0 drop-shadow-sm" />
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold text-md-on-surface tracking-tight">
                StackLyra ERP &amp; POS Workspace
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-md-primary-container text-md-on-primary-container text-xs font-mono font-semibold">
                {ERP_VERSION_TAG}
              </span>
            </div>
            <p className="text-sm text-md-on-surface-variant leading-relaxed">
              Full-stack Material Design 3 Enterprise Resource Planning, POS Terminal,
              Invoicing, Integer-Paisa Double-Entry Khata Accounting, and Punjab Revenue
              Authority (PRA e-IMS) compliance platform.
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {STACK_TAGS.map((tech) => (
                <span
                  key={tech}
                  className="px-2.5 py-1 rounded-lg bg-md-surface-container-low text-md-on-surface-variant text-xs font-medium border border-md-outline-variant/60"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Creator Profile & Social Links */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <Card className="lg:col-span-7 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-md-on-surface">
                Creator &amp; Social Links
              </h3>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                {ERP_AUTHOR.tagline} · {ERP_AUTHOR.role}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-md-primary-container text-md-on-primary-container flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5" />
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ERP_SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${social.label} — ${social.handle}`}
                className="group flex items-center justify-between gap-3 p-3.5 rounded-xl border border-md-outline-variant bg-md-surface-container-low/60 hover:bg-md-primary-container/40 hover:border-md-primary transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition ${
                      social.isConfigured
                        ? "bg-md-primary text-md-on-primary"
                        : "bg-md-surface-container-high text-md-on-surface-variant group-hover:bg-md-primary-container group-hover:text-md-on-primary-container"
                    }`}
                  >
                    <SocialBrandIcon id={social.id} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-md-on-surface flex items-center gap-1.5">
                      <span>{social.label}</span>
                      {social.isConfigured && (
                        <span className="w-1.5 h-1.5 rounded-full bg-md-primary inline-block" />
                      )}
                    </div>
                    <div className="text-xs text-md-on-surface-variant truncate font-mono">
                      {social.handle}
                    </div>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-md-on-surface-variant group-hover:text-md-primary shrink-0 transition" />
              </a>
            ))}
          </div>
        </Card>

        {/* Versioning Methodology Card */}
        <Card variant="tonal" className="lg:col-span-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-md-on-surface">
                Versioning Standard
              </h3>
              <p className="text-xs text-md-on-surface-variant mt-0.5">
                Baseline {ERP_VERSION_POLICY.baseline} · Pre-1.0 Release Cycle
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-md-secondary-container text-md-on-secondary-container flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-md-surface-container-lowest border border-md-outline-variant/60">
              <div className="text-md-on-surface-variant">Minor / Patch</div>
              <div className="text-base font-mono font-semibold text-md-on-surface mt-0.5">
                {ERP_VERSION_POLICY.minorStep}
              </div>
              <div className="text-[11px] text-md-on-surface-variant mt-0.5">
                0.5.0 → 0.5.1
              </div>
            </div>
            <div className="p-3 rounded-xl bg-md-surface-container-lowest border border-md-outline-variant/60">
              <div className="text-md-on-surface-variant">Major Milestone</div>
              <div className="text-base font-mono font-semibold text-md-on-surface mt-0.5">
                {ERP_VERSION_POLICY.majorStep}
              </div>
              <div className="text-[11px] text-md-on-surface-variant mt-0.5">
                0.5.x → 0.6.0
              </div>
            </div>
          </div>

          <p className="text-xs text-md-on-surface-variant leading-relaxed">
            {ERP_VERSION_POLICY.note}
          </p>
        </Card>
      </div>

      {/* Changelog / Release Highlights */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-md-primary" />
            <h3 className="text-base font-semibold text-md-on-surface">
              Release History &amp; Highlights
            </h3>
          </div>
          <span className="text-xs text-md-on-surface-variant font-mono">
            Tip: Press Ctrl+K / Cmd+K anytime to jump across modules
          </span>
        </div>

        <div className="space-y-4">
          {ERP_RELEASES.map((rel) => (
            <div
              key={rel.version}
              className="p-4 rounded-xl bg-md-surface-container-low border border-md-outline-variant/60 space-y-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip label={rel.version} variant="primary" />
                <StatusChip label={rel.stage} variant="neutral" />
                <span className="text-sm font-medium text-md-on-surface">
                  {rel.summary}
                </span>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {rel.highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-xs text-md-on-surface-variant"
                  >
                    <CheckCircle2 className="w-4 h-4 text-md-primary shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
