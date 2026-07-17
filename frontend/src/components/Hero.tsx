import { motion } from 'framer-motion';
import { ArrowDownRight, ShieldCheck, Sparkles } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface HeroProps {
  recentLinks: ShortenedURL[];
  onPrimaryAction: () => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6 },
  }),
};

export function Hero({ recentLinks, onPrimaryAction }: HeroProps) {
  const totalClicks = recentLinks.reduce((sum, link) => sum + link.click_count, 0);
  const managedLinks = recentLinks.filter((link) => link.tag || link.expires_at || link.max_clicks).length;

  return (
    <section className="hero-section">
      <div className="hero-copy">
        <motion.div
          className="hero-eyebrow"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          <Sparkles size={16} />
          Short links with built-in controls
        </motion.div>

        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          Shorten Links. Track Clicks. Own Your Brand.
        </motion.h1>

        <motion.p
          className="hero-lede"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          Transform long, clunky URLs into branded short links. Gain actionable insights with real-time analytics, custom aliases, and advanced access controls.
        </motion.p>

        <motion.div
          className="hero-actions"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <button type="button" className="primary-cta" onClick={onPrimaryAction}>
            Start shortening
            <ArrowDownRight size={18} />
          </button>
          <div className="hero-supporting">
            <ShieldCheck size={16} />
            Self-hosted, privacy-friendly, analytics included
          </div>
        </motion.div>

        <motion.div
          className="hero-metrics"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={4}
        >
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
        </motion.div>
      </div>
    </section>
  );
}
