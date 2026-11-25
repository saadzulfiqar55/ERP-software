import React, { useId } from "react";

export interface StackLyraLogoProps {
  /** Pixel width and height of the square SVG mark. Defaults to 40. */
  size?: number;
  className?: string;
}

/**
 * StackLyra ERP Spark Crest monogram ("S" crest enclosed in a Material 3 squircle).
 * Safe to render in both Server and Client components; uses `useId()` to keep
 * SVG gradient IDs unique when multiple instances appear on screen.
 */
export function StackLyraLogo({ size = 40, className }: StackLyraLogoProps) {
  const uid = useId().replace(/:/g, "");
  const bgId = `stacklyra-crest-bg-${uid}`;
  const rimId = `stacklyra-crest-rim-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={bgId}
          x1="8"
          y1="4"
          x2="56"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#2E5B88" />
          <stop offset="55%" stopColor="#1A3B5E" />
          <stop offset="100%" stopColor="#0E223A" />
        </linearGradient>
        <linearGradient
          id={rimId}
          x1="6"
          y1="4"
          x2="58"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#D1E4FF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#36618E" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${bgId})`} />
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        stroke={`url(#${rimId})`}
        strokeWidth="2"
      />
      <path
        d="M40.5 20.5C37.5 16 22 15.5 22 23.5C22 31.2 42 32 42 40.5C42 48.5 24 48.5 21 43.5"
        stroke="#FFFFFF"
        strokeWidth="7.2"
        strokeLinecap="round"
      />
      <path
        d="M40.5 20.5C38.2 17.2 31.8 16.4 27.5 17.4"
        stroke="#8ECAFF"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M46.5 12L48 15.8L51.8 17.3L48 18.8L46.5 22.6L45 18.8L41.2 17.3L45 15.8L46.5 12Z"
        fill="#A0CAFD"
      />
    </svg>
  );
}

export default StackLyraLogo;
