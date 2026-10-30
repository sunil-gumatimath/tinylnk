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
    sm: { icon: 20, text: "1.1rem", gap: "6px" },
    md: { icon: 26, text: "1.35rem", gap: "9px" },
    lg: { icon: 34, text: "1.75rem", gap: "12px" },
  }[size];

  return (
    <span
      className={`brand-logo brand-logo--${size} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: dimensions.gap,
        textDecoration: "none",
      }}
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
        <defs>
          <filter id="logo-dot-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Incoming link loop */}
        <path
          className="logo-loop-in"
          d="M12 17L8.5 20.5C6.3 22.7 6.3 26.3 8.5 28.5C10.7 30.7 14.3 30.7 16.5 28.5L20 25"
          stroke="var(--text-muted)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Outgoing link loop */}
        <path
          className="logo-loop-out"
          d="M20 15L23.5 11.5C25.7 9.3 25.7 5.7 23.5 3.5C21.3 1.3 17.7 1.3 15.5 3.5L12 7"
          stroke="var(--heading)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Central signal beam */}
        <line
          className="logo-signal-beam"
          x1="10.5"
          y1="21.5"
          x2="21.5"
          y2="10.5"
          stroke="var(--primary)"
          strokeWidth="2.85"
          strokeLinecap="round"
        />

        {/* Compressed terminal pulse dot */}
        <circle
          className="logo-pulse-dot"
          cx="21.5"
          cy="10.5"
          r="2.2"
          fill="var(--primary)"
          filter="url(#logo-dot-glow)"
        />
      </svg>

      {!iconOnly && (
        <span
          className="brand-logo-text"
          style={{
            fontSize: dimensions.text,
            fontWeight: 800,
            letterSpacing: "-0.05em",
            fontFamily: "var(--font-sans)",
            color: "var(--heading)",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <span className="brand-name-tiny">tiny</span>
          <span className="brand-name-lnk">lnk</span>
          {showBadge && <span className="brand-logo-tag">OSS</span>}
        </span>
      )}
    </span>
  );
};
