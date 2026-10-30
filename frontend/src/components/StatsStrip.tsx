import React from "react";
import { motion } from "framer-motion";
import { Database, Lock, ShieldCheck, Zap } from "lucide-react";
import { CornerTicks } from "./CornerTicks";
import { SectionGridLines } from "./SectionGridLines";

const stats = [
  {
    id: 1,
    value: "< 10ms",
    label: "REDIRECT OVERHEAD",
    sub: "Lightning-fast edge delivery",
    icon: <Zap size={18} className="stat-icon-svg" />,
  },
  {
    id: 2,
    value: "100%",
    label: "SELF-HOSTED",
    sub: "Full data sovereignty",
    icon: <ShieldCheck size={18} className="stat-icon-svg" />,
  },
  {
    id: 3,
    value: "Postgres",
    label: "DATABASE CORE",
    sub: "Neon cloud or local instance",
    icon: <Database size={18} className="stat-icon-svg" />,
  },
  {
    id: 4,
    value: "Zero",
    label: "3RD-PARTY TRACKING",
    sub: "Privacy-first analytics",
    icon: <Lock size={18} className="stat-icon-svg" />,
  },
];

export const StatsStrip: React.FC = () => {
  return (
    <section className="stats-section" aria-label="System Specifications">
      <SectionGridLines top={false} bottom={true} highlightCorner="none" />
      <div className="section-container">
        <div className="stats-grid">
          {stats.map((item, index) => (
            <motion.div
              key={item.id}
              className="stat-card has-corner-ticks"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
            >
              <CornerTicks />
              <div className="stat-icon-box">{item.icon}</div>
              <div className="stat-content">
                <span className="stat-value">{item.value}</span>
                <span className="stat-label">{item.label}</span>
                <span className="stat-sub">{item.sub}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
