import React from "react";

export const CornerTicks: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <>
      <span className={`corner-tick corner-tl ${className}`} aria-hidden="true" />
      <span className={`corner-tick corner-tr ${className}`} aria-hidden="true" />
      <span className={`corner-tick corner-bl ${className}`} aria-hidden="true" />
      <span className={`corner-tick corner-br ${className}`} aria-hidden="true" />
    </>
  );
};
