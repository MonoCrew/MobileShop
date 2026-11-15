import React from "react";

/**
 * Sheikh Hammad Royal Black & Gold Logo
 * Features:
 * - Perfectly centered 5-point royal black-and-gold crown
 * - "SHEIKH" in local Cinzel bold serif with metallic gold 3D stroke
 * - "HAMMAD" with tapered golden spear divider lines
 * - Local font-face rendered seamlessly with zero external dependencies
 */
export const Logo = ({ height = 44, className = "" }) => {
  return (
    <div
      className={`d-inline-flex align-items-center ${className}`}
      style={{ userSelect: "none" }}
    >
      <svg
        viewBox="0 0 280 78"
        height={height}
        style={{
          width: "auto",
          maxHeight: "100%",
          display: "block",
          overflow: "visible",
        }}
        aria-label="Sheikh Hammad Logo"
      >
        <defs>
          {/* Rich metallic gold gradient */}
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fae084" />
            <stop offset="25%" stopColor="#dfa01e" />
            <stop offset="50%" stopColor="#fff8cf" />
            <stop offset="75%" stopColor="#c58a14" />
            <stop offset="100%" stopColor="#875306" />
          </linearGradient>

          {/* Horizontal divider line gradients */}
          <linearGradient id="goldLineLeft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#dfa01e" stopOpacity="0" />
            <stop offset="60%" stopColor="#fae084" />
            <stop offset="100%" stopColor="#c58a14" />
          </linearGradient>

          <linearGradient id="goldLineRight" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#c58a14" />
            <stop offset="40%" stopColor="#fae084" />
            <stop offset="100%" stopColor="#dfa01e" stopOpacity="0" />
          </linearGradient>

          {/* Subtle drop shadow */}
          <filter id="royalShadow" x="-10%" y="-10%" width="120%" height="125%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* ================= ROYAL CROWN ================= */}
        {/* Sits directly and symmetrically above "SHEIKH" (Center: x = 140) */}
        <g id="royal-crown" filter="url(#royalShadow)">
          {/* Crown Base Rim Band */}
          <path
            d="M 116,23.5 Q 140,26.5 164,23.5 L 163,26.5 Q 140,29.5 117,26.5 Z"
            fill="url(#goldGradient)"
            stroke="#6e4202"
            strokeWidth="0.6"
          />

          {/* Crown Main Body with 5 Royal Peaks */}
          <path
            d="M 116,23.5 
               L 112,10 
               L 120,15 
               L 125,5.5 
               L 132.5,13 
               L 140,2 
               L 147.5,13 
               L 155,5.5 
               L 160,15 
               L 168,10 
               L 164,23.5 
               Q 140,26.5 116,23.5 Z"
            fill="#09090b"
            stroke="url(#goldGradient)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />

          {/* Crown Inner Gold Arch Rib */}
          <path
            d="M 121,22 Q 140,25 159,22"
            fill="none"
            stroke="url(#goldGradient)"
            strokeWidth="1.2"
          />

          {/* Crown Tip Jewels / Pearls */}
          <circle cx="112" cy="9.5" r="2.2" fill="url(#goldGradient)" stroke="#5c3803" strokeWidth="0.5" />
          <circle cx="125" cy="5" r="2.5" fill="url(#goldGradient)" stroke="#5c3803" strokeWidth="0.5" />
          <circle cx="140" cy="1.2" r="3.2" fill="url(#goldGradient)" stroke="#5c3803" strokeWidth="0.6" />
          <circle cx="155" cy="5" r="2.5" fill="url(#goldGradient)" stroke="#5c3803" strokeWidth="0.5" />
          <circle cx="168" cy="9.5" r="2.2" fill="url(#goldGradient)" stroke="#5c3803" strokeWidth="0.5" />

          {/* 3 Gem Accents on Base Band */}
          <circle cx="130" cy="25.5" r="1.1" fill="#fff" />
          <circle cx="140" cy="26.5" r="1.3" fill="#fff" />
          <circle cx="150" cy="25.5" r="1.1" fill="#fff" />
        </g>

        {/* ================= BRAND NAME: SHEIKH ================= */}
        <text
          x="140"
          y="54"
          textAnchor="middle"
          fill="#09090b"
          stroke="url(#goldGradient)"
          strokeWidth="1.1"
          paintOrder="stroke fill"
          fontFamily="'Cinzel', 'Playfair Display', 'Times New Roman', Georgia, serif"
          fontSize="33"
          fontWeight="900"
          letterSpacing="3.5"
          filter="url(#royalShadow)"
        >
          SHEIKH
        </text>

        {/* ================= SUBTITLE: — HAMMAD — ================= */}
        {/* Left Tapered Line */}
        <path
          d="M 28,67 L 90,67 L 90,68.5 L 28,67 Z"
          fill="url(#goldLineLeft)"
        />

        {/* "HAMMAD" Text */}
        <text
          x="140"
          y="71.5"
          textAnchor="middle"
          fill="#09090b"
          stroke="url(#goldGradient)"
          strokeWidth="0.5"
          paintOrder="stroke fill"
          fontFamily="'Cinzel', 'Times New Roman', Georgia, serif"
          fontSize="11.5"
          fontWeight="800"
          letterSpacing="4.8"
        >
          HAMMAD
        </text>

        {/* Right Tapered Line */}
        <path
          d="M 190,67 L 252,67 L 190,68.5 L 190,67 Z"
          fill="url(#goldLineRight)"
        />
      </svg>
    </div>
  );
};

/**
 * Compact emblem for collapsed sidebar mode
 */
export const LogoIcon = ({ size = 36, className = "" }) => {
  return (
    <div
      className={`rounded bg-dark d-flex align-items-center justify-content-center shadow-sm ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: "linear-gradient(145deg, #18181b 0%, #09090b 100%)",
        border: "1px solid rgba(223, 160, 30, 0.4)",
        userSelect: "none",
        cursor: "pointer",
        flexShrink: 0,
      }}
      title="Sheikh Hammad"
    >
      <svg
        viewBox="0 0 100 100"
        width={size * 0.75}
        height={size * 0.75}
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="goldIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fae084" />
            <stop offset="50%" stopColor="#dfa01e" />
            <stop offset="100%" stopColor="#875306" />
          </linearGradient>
        </defs>

        {/* Crown on top */}
        <g id="crown-icon">
          <path
            d="M 22,40 
               L 16,24 
               L 26,30 
               L 35,18 
               L 42,27 
               L 50,13 
               L 58,27 
               L 65,18 
               L 74,30 
               L 84,24 
               L 78,40 
               Q 50,44 22,40 Z"
            fill="#09090b"
            stroke="url(#goldIconGrad)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="23" r="2.8" fill="url(#goldIconGrad)" />
          <circle cx="35" cy="17" r="3" fill="url(#goldIconGrad)" />
          <circle cx="50" cy="12" r="3.6" fill="url(#goldIconGrad)" />
          <circle cx="65" cy="17" r="3" fill="url(#goldIconGrad)" />
          <circle cx="84" cy="23" r="2.8" fill="url(#goldIconGrad)" />
        </g>

        {/* "SH" Monogram */}
        <text
          x="50"
          y="80"
          textAnchor="middle"
          fill="url(#goldIconGrad)"
          fontFamily="'Cinzel', 'Times New Roman', Georgia, serif"
          fontSize="35"
          fontWeight="900"
          letterSpacing="1"
        >
          SH
        </text>
      </svg>
    </div>
  );
};

export default Logo;
