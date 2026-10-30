import React, { useState } from "react";
import { Globe } from "lucide-react";
import { extractDomain } from "../ui";

interface UrlFaviconProps {
  url: string;
  size?: number; // container size in px, defaults to 28
  className?: string;
  title?: string;
}

export const UrlFavicon: React.FC<UrlFaviconProps> = ({
  url,
  size = 28,
  className = "",
  title,
}) => {
  const domain = extractDomain(url);
  // Source tier: 0 = Google S2 (64px high-res), 1 = DuckDuckGo .ico, 2 = Fallback Lucide Globe
  const [sourceTier, setSourceTier] = useState<number>(0);
  const [prevUrl, setPrevUrl] = useState(url);

  // Reset tier when URL changes (React render-pass adjustment pattern)
  if (url !== prevUrl) {
    setPrevUrl(url);
    setSourceTier(0);
  }

  const iconSize = Math.max(14, Math.round(size * 0.58));

  const getFaviconSrc = () => {
    if (!domain) return null;
    if (sourceTier === 0) {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
    }
    if (sourceTier === 1) {
      return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
    }
    return null;
  };

  const handleImgError = () => {
    setSourceTier((prev) => prev + 1);
  };

  const currentSrc = getFaviconSrc();

  return (
    <div
      className={`url-favicon-badge ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
      }}
      title={title || domain || "Website icon"}
      aria-label={domain ? `${domain} logo` : "Website logo"}
    >
      {currentSrc && sourceTier < 2 ? (
        <img
          src={currentSrc}
          alt={domain ? `${domain} icon` : "Website icon"}
          width={iconSize}
          height={iconSize}
          className="url-favicon-img"
          loading="lazy"
          onError={handleImgError}
        />
      ) : (
        <Globe
          size={iconSize}
          className="url-favicon-fallback"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
