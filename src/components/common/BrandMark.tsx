import React, { useId } from 'react';
import logoUrl from '../../assets/brand/logo.svg';
import logoInverseUrl from '../../assets/brand/logo-inverse.svg';

/**
 * LUYIMEI icon: a road turning a corner on a blue tile, with a yellow centre line.
 * Drawn inline so it stays sharp at any size; the clip id is unique per instance.
 */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => {
  const clip = `lym-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 396 396" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <rect width="396" height="396" rx="96" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="396" height="396" fill="#1F5FD7" />
        <path d="M146 0V236A68 68 0 0 0 214 304H400" fill="none" stroke="#fff" strokeWidth="84" />
        <path
          d="M146 0V236A68 68 0 0 0 214 304H372"
          fill="none"
          stroke="#F5B900"
          strokeWidth="11"
          strokeDasharray="25 21"
          strokeDashoffset="30.2"
        />
      </g>
    </svg>
  );
};

/** Full horizontal logo (icon + LUYIMEI wordmark). `inverse` is for dark backgrounds. */
export const BrandLogo: React.FC<{ className?: string; inverse?: boolean }> = ({ className, inverse }) => (
  <img
    src={inverse ? logoInverseUrl : logoUrl}
    alt="LUYIMEI Engineering Equipment"
    width={1473}
    height={398}
    className={className}
    decoding="async"
  />
);
