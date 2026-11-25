import React from "react";

export interface StackLyraLogoProps {
  /** Pixel width and height of the square SVG mark. Defaults to 40. */
  size?: number;
  className?: string;
}

/**
 * StackLyra ERP Brand Mark: the geometric origami bird from stacklyra.com
 * enclosed inside a Material 3 deep-navy squircle.
 */
export function StackLyraLogo({ size = 40, className }: StackLyraLogoProps) {
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
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0e1b3d" />
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        stroke="#faf8f3"
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <g transform="translate(9.66 10) scale(1.375)">
        {/* Upper wing crest */}
        <polygon points="3.5,4.5 13.5,7.5 17.5,13.5" fill="#ffc83d" />
        {/* Main sweeping wing */}
        <polygon points="3.5,4.5 17.5,13.5 10,17" fill="#ff5b1f" />
        {/* Lower wing / body core */}
        <polygon points="10,17 17.5,13.5 22,18.5 14.5,25" fill="#ffc83d" />
        {/* Chest facet */}
        <polygon points="17.5,13.5 23,11.5 22,18.5" fill="#e6480f" />
        {/* Tail feather */}
        <polygon points="10,17 14.5,25 5,28" fill="#e6480f" />
        {/* Head & neck (ivory on dark navy squircle) */}
        <polygon points="16.5,4 23,7 23,11.5 17.5,13.5" fill="#faf8f3" />
        {/* Beak */}
        <polygon points="23,7 29,9.5 23,11.5" fill="#ffc83d" />
        {/* Eye spark */}
        <polygon points="19.2,7.6 21.8,8.8 19.5,10.2" fill="#19c39a" />
      </g>
    </svg>
  );
}

export default StackLyraLogo;
