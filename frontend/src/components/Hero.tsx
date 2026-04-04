import { ArrowDownRight, Link2, ShieldCheck, Sparkles, TimerReset, Zap } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface HeroProps {
  recentLinks: ShortenedURL[];
  onPrimaryAction: () => void;
}

export function Hero({ recentLinks, onPrimaryAction }: HeroProps) {
  const totalClicks = recentLinks.reduce((sum, link) => sum + link.click_count, 0);
  const managedLinks = recentLinks.filter((link) => link.tag || link.expires_at || link.max_clicks).length;

  return (
    <section className="hero-section">
      <div className="hero-copy">
        <div className="hero-eyebrow">
          <Sparkles size={16} />
          Short links with built-in controls
        </div>

        <h1>Shorten Links. Track Clicks. Own Your Brand.</h1>
        <p className="hero-lede">
          Transform long, clunky URLs into branded short links. Gain actionable insights with real-time analytics, custom aliases, and advanced access controls.
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
            <span className="metric-label">Active Links</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{totalClicks.toLocaleString()}</span>
            <span className="metric-label">Total Engagements</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{managedLinks}</span>
            <span className="metric-label">Managed links</span>
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
                  <div className="mini-input truncate-text">example.com/campaign/spring-launch</div>
                  <div className="mini-button">Shorten</div>
                </div>
              </div>

              <div className="showcase-grid">
                <div className="mini-analytics-card">
                  <div className="mini-label">
                    <Zap size={15} />
                    Click activity
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
                    Link controls
                  </div>
                  <ul className="mini-list">
                    <li>Custom aliases</li>
                    <li>Expiry windows</li>
                    <li>QR downloads</li>
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

// TODO: Add ARIA labels for accessibility

// TODO: Add entrance animations for hero section

// TODO: Add keyboard navigation support

// TODO: Add entrance animations with Framer Motion

// TODO: Add ARIA labels for screen reader accessibility
