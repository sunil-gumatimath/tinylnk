import React from "react";

interface SectionGridLinesProps {
  top?: boolean;
  bottom?: boolean;
  highlightCorner?: "tl" | "tr" | "bl" | "br" | "none";
  className?: string;
}

export const SectionGridLines: React.FC<SectionGridLinesProps> = ({
  top = true,
  bottom = true,
  highlightCorner = "tl",
  className = "",
}) => {
  return (
    <div className={`section-grid-frame pointer-events-none ${className}`} aria-hidden="true">
      {/* Horizontal border lines spanning 100% width across the screen */}
      {top && <div className="grid-line-h grid-line-h-top" />}
      {bottom && <div className="grid-line-h grid-line-h-bottom" />}

      {/* Vertical guide lines running from top to bottom */}
      <div className="grid-line-v grid-line-v-left" />
      <div className="grid-line-v grid-line-v-right" />

      {/* Crosshair "+" reticles sitting precisely at the 4 intersection points */}
      {top && (
        <>
          <div className={`grid-crosshair grid-crosshair-tl ${highlightCorner === "tl" ? "grid-crosshair-accent" : ""}`}>
            <div className="grid-crosshair-h" />
            <div className="grid-crosshair-v" />
          </div>
          <div className={`grid-crosshair grid-crosshair-tr ${highlightCorner === "tr" ? "grid-crosshair-accent" : ""}`}>
            <div className="grid-crosshair-h" />
            <div className="grid-crosshair-v" />
          </div>
        </>
      )}

      {bottom && (
        <>
          <div className={`grid-crosshair grid-crosshair-bl ${highlightCorner === "bl" ? "grid-crosshair-accent" : ""}`}>
            <div className="grid-crosshair-h" />
            <div className="grid-crosshair-v" />
          </div>
          <div className={`grid-crosshair grid-crosshair-br ${highlightCorner === "br" ? "grid-crosshair-accent" : ""}`}>
            <div className="grid-crosshair-h" />
            <div className="grid-crosshair-v" />
          </div>
        </>
      )}
    </div>
  );
};
