import { ArrowDownRight, Link2, ShieldCheck, Sparkles, TimerReset, Zap } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface HeroProps {
  recentLinks: ShortenedURL[];
  onPrimaryAction: () => void;
}

export function Hero({ recentLinks, onPrimaryAction }: HeroProps) {
  const totalClicks = recentLinks.reduce((sum, link) => sum + link.click_count, 0);

  return (
    <section className="hero-section">
      <div className="hero-copy">
        <div className="hero-eyebrow">
          <Sparkles size={16} />
          Tiny links with a product-grade interface
        </div>

        <h1>Shorten, track, and share links from one focused workspace.</h1>
        <p className="hero-lede">
          tinylnk now feels more like a modern publishing tool than a utility page, with a faster path to shorten,
          clearer link management, and analytics that are easy to scan.
        </p>

        <div className="hero-actions">
          <button type="button" className="primary-cta" onClick={onPrimaryAction}>
            Start shortening
            <ArrowDownRight size={18} />
          </button>
          <div className="hero-supporting">
            <ShieldCheck size={16} />
            Self-hosted, privacy-friendly, analytics included
          </div>
        </div>

        <div className="hero-metrics">
          <div className="metric-card">
            <span className="metric-value">{recentLinks.length}</span>
            <span className="metric-label">Recent links</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{totalClicks.toLocaleString()}</span>
            <span className="metric-label">Tracked clicks</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">24/7</span>
            <span className="metric-label">Always ready</span>
          </div>
        </div>
      </div>

      <div className="hero-showcase panel-surface">
        <div className="showcase-topline">Workspace preview</div>
        <div className="showcase-frame">
          <div className="showcase-window">
            <div className="showcase-dots">
              <span />
              <span />
              <span />
            </div>
            <div className="showcase-body">
              <div className="mini-shortener">
                <div className="mini-title">
                  <Link2 size={16} />
                  Quick shorten
                </div>
                <div className="mini-input-row">
                  <div className="mini-input">newsletter.example.com/campaign/spring-launch</div>
                  <div className="mini-button">Create</div>
                </div>
              </div>

              <div className="showcase-grid">
                <div className="mini-analytics-card">
                  <div className="mini-label">
                    <Zap size={15} />
                    Performance
                  </div>
                  <div className="mini-number">{totalClicks || 128}</div>
                  <div className="mini-bars">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>

                <div className="mini-analytics-card warm">
                  <div className="mini-label">
                    <TimerReset size={15} />
                    Controls
                  </div>
                  <ul className="mini-list">
                    <li>Custom aliases</li>
                    <li>Expiry rules</li>
                    <li>QR download</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
