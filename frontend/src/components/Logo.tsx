import React from "react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
  showBadge?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = "md",
  iconOnly = false,
  className = "",
  showBadge = false,
}) => {
  const dimensions = {
    sm: { icon: 22, text: "1.15rem", slash: "1.22rem", gap: "6px" },
    md: { icon: 28, text: "1.42rem", slash: "1.52rem", gap: "8px" },
    lg: { icon: 36, text: "1.85rem", slash: "2.0rem", gap: "10px" },
  }[size];

  if (iconOnly) {
    return (
      <span
        className={`brand-logo brand-logo--icon ${className}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
        }}
        aria-label="tinylnk"
      >
        <svg
          className="brand-logo-icon"
          width={dimensions.icon}
          height={dimensions.icon}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* 'T' Monogram */}
          <path
            d="M5 10.5h12"
            stroke="var(--heading)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M11 10.5v12c0 2 1.5 3.5 3.5 3.5h2"
            stroke="var(--heading)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* 'L' Monogram Interlock */}
          <path
            d="M19 6v14c0 2.2 1.8 4 4 4h4"
            stroke="var(--primary)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx="27"
            cy="24"
            r="2"
            fill="#a3ff12"
          />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`brand-logo brand-wordmark brand-logo--${size} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: dimensions.gap,
        textDecoration: "none",
        userSelect: "none",
      }}
    >
      <span
        className="brand-wordmark-text"
        style={{
          fontSize: dimensions.text,
          fontWeight: 800,
          letterSpacing: "-0.055em",
          fontFamily: "var(--font-sans)",
          color: "var(--heading)",
          display: "inline-flex",
          alignItems: "center",
          lineHeight: 1,
        }}
      >
        <span className="brand-name-tiny" style={{ fontWeight: 750, color: "var(--heading)" }}>
          tiny
        </span>
        <span
          className="brand-name-slash"
          style={{
            fontSize: dimensions.slash,
            fontWeight: 900,
            color: "var(--primary)",
            margin: "0 0.5px",
            lineHeight: 0.9,
          }}
        >
          /
        </span>
        <span className="brand-name-lnk" style={{ fontWeight: 850, color: "var(--heading)" }}>
          lnk
        </span>
      </span>

      {showBadge && (
        <span
          className="brand-logo-tag"
          style={{
            fontSize: "0.62rem",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "color-mix(in srgb, var(--primary) 12%, transparent)",
            color: "var(--primary)",
            border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)",
          }}
        >
          OSS
        </span>
      )}
    </span>
  );
};
