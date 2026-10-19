import React from 'react';

export const ColdPatchSvg: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 320 270" role="img" aria-label="冷补料包装示意" className={className}>
    <defs>
      <linearGradient id="bag-grad" x2="1" y2="1">
        <stop stopColor="#eeeede" />
        <stop offset="1" stopColor="#c9c9b5" />
      </linearGradient>
    </defs>
    <ellipse cx="160" cy="220" rx="88" ry="12" fill="#161718" opacity=".08" />
    <path d="M106 64L205 64 214 204Q160 220 100 202Z" fill="url(#bag-grad)" stroke="#aeb1b3" />
    <path d="M106 64L117 52H194L205 64" fill="#f4f3e7" stroke="#aeb1b3" />
    <path d="M104 98H208V153H102" fill="#333739" />
    <text x="155" y="123" fill="#7dd3fc" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="700">
      LYM
    </text>
    <text x="156" y="140" fill="#fff" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="7" letterSpacing="2">
      COLD PATCH
    </text>
    <path d="M121 177H189M121 184H169" stroke="#7d8082" strokeWidth="2" />
    <text x="183" y="198" fontSize="9" fill="#5f6264" fontFamily="Arial, sans-serif">
      25 kg
    </text>
  </svg>
);

export const CrackTapeSvg: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 320 270" role="img" aria-label="裂缝贴卷材示意" className={className}>
    <defs>
      <linearGradient id="roll-grad" x2="0" y2="1">
        <stop stopColor="#55585a" />
        <stop offset="1" stopColor="#212426" />
      </linearGradient>
    </defs>
    <ellipse cx="157" cy="219" rx="99" ry="12" fill="#161718" opacity=".08" />
    <path d="M112 126L249 178 216 205 90 165" fill="#36393b" />
    <path d="M216 205L249 178V186L216 213 90 172V165" fill="#1f2224" />
    <ellipse cx="126" cy="130" rx="59" ry="65" fill="url(#roll-grad)" transform="rotate(-25 126 130)" />
    <ellipse cx="143" cy="123" rx="41" ry="57" fill="#7a7d7f" transform="rotate(-25 143 123)" />
    <ellipse cx="143" cy="123" rx="23" ry="35" fill="#dddcca" transform="rotate(-25 143 123)" />
    <ellipse cx="143" cy="123" rx="13" ry="23" fill="#a4a7a9" transform="rotate(-25 143 123)" />
    <path d="M99 168L116 177" stroke="#38bdf8" strokeWidth="10" />
    <text x="204" y="181" fill="#7dd3fc" fontSize="10" transform="rotate(21 204 181)" fontFamily="Arial, sans-serif" fontWeight="bold">
      LYM
    </text>
  </svg>
);

export const CutterSvg: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 320 270" role="img" aria-label="切缝机示意" className={className}>
    <ellipse cx="158" cy="227" rx="96" ry="10" fill="#161718" opacity=".08" />
    <path d="M101 192L221 185 243 210H104Z" fill="#313436" />
    <circle cx="128" cy="211" r="20" fill="#282b2d" />
    <circle cx="128" cy="211" r="9" fill="#939698" />
    <circle cx="229" cy="211" r="16" fill="#282b2d" />
    <circle cx="229" cy="211" r="7" fill="#939698" />
    <path d="M130 177V119H195V172" fill="#38bdf8" stroke="#5b5e60" strokeWidth="2" />
    <rect x="140" y="103" width="46" height="22" rx="4" fill="#333739" />
    <rect x="139" y="135" width="50" height="28" rx="3" fill="#686b6d" />
    <path d="M106 190L86 90 62 64H97L121 107" fill="none" stroke="#434648" strokeWidth="7" strokeLinejoin="round" />
    <path d="M62 64H100" stroke="#232628" strokeWidth="10" strokeLinecap="round" />
    <circle cx="191" cy="196" r="35" fill="#a3a6a8" stroke="#5c5f61" strokeWidth="3" />
    <circle cx="191" cy="196" r="6" fill="#444749" />
    <path d="M160 180L187 167 218 178" fill="#7dd3fc" />
    <text x="148" y="157" fontSize="11" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold">
      LYM
    </text>
  </svg>
);

export const SealingMachineSvg: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 320 270" role="img" aria-label="道路灌缝设备示意" className={className}>
    <ellipse cx="159" cy="226" rx="104" ry="11" fill="#161718" opacity=".08" />
    <path d="M73 186H246V206H73Z" fill="#333739" />
    <circle cx="112" cy="211" r="21" fill="#292d30" />
    <circle cx="112" cy="211" r="9" fill="#9da0a2" />
    <circle cx="216" cy="211" r="21" fill="#292d30" />
    <circle cx="216" cy="211" r="9" fill="#9da0a2" />
    <rect x="99" y="113" width="105" height="76" rx="5" fill="#38bdf8" stroke="#585b5d" />
    <path d="M106 113V104H196V113" fill="#3b3e40" />
    <rect x="122" y="121" width="51" height="16" rx="2" fill="#333739" />
    <text x="147" y="132" textAnchor="middle" fontSize="10" fill="#fff" fontFamily="Arial, sans-serif" fontWeight="bold">
      LYM
    </text>
    <rect x="206" y="128" width="33" height="59" rx="3" fill="#65686a" />
    <rect x="122" y="78" width="53" height="26" rx="3" fill="#333739" />
    <path d="M183 149C258 150 264 59 201 57S60 55 64 176" fill="none" stroke="#323537" strokeWidth="8" />
    <path d="M64 176L51 222" stroke="#535658" strokeWidth="6" />
    <path d="M193 177H243" stroke="#333739" strokeWidth="6" />
    <circle cx="222" cy="145" r="8" fill="#eeeedd" />
    <path d="M222 145L226 141" stroke="#484b4d" strokeWidth="2" />
  </svg>
);

export const ProductIllustration: React.FC<{ id: string; className?: string }> = ({ id, className }) => {
  switch (id) {
    case '0':
      return <ColdPatchSvg className={className} />;
    case '1':
      return <CrackTapeSvg className={className} />;
    case '2':
      return <CutterSvg className={className} />;
    case '3':
      return <SealingMachineSvg className={className} />;
    default:
      return <ColdPatchSvg className={className} />;
  }
};
