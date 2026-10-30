import { motion } from "framer-motion";
import { ArrowDownRight, ShieldCheck, Sparkles } from "lucide-react";
import { SectionGridLines } from "./SectionGridLines";

const fadeUp = {
	hidden: { opacity: 0, y: 30 },
	visible: (i: number) => ({
		opacity: 1,
		y: 0,
		transition: { delay: i * 0.12, duration: 0.6 },
	}),
};

export function Hero() {
	return (
		<section className="hero-section" id="top">
			<div className="hero-ambient-glow" aria-hidden="true" />
			<SectionGridLines top={false} bottom={true} highlightCorner="tl" />
			<div className="hero-copy section-container">
				<motion.div
					className="hero-badge"
					custom={0}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					<span className="hero-marker" aria-hidden="true">//</span>
					<span>SELF-HOSTED LINK SHORTENER</span>
				</motion.div>

				<motion.h1
					custom={1}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					Short links.
					<br />
					<span className="text-gradient">Clear insights.</span>
				</motion.h1>

				<motion.p
					className="hero-subtitle"
					custom={2}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					Create short links, share them anywhere, and track clicks from your own server.
				</motion.p>

				<motion.div
					className="hero-actions"
					custom={3}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					<a className="hero-cta" href="#shorten-form">
						Create a short link
						<ArrowDownRight size={16} />
					</a>
					<a className="hero-secondary" href="#features">Explore features</a>
				</motion.div>

				<motion.div
					className="hero-features"
					custom={4}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					<div className="hero-feature">
						<ShieldCheck size={16} />
						<span>Click tracking</span>
					</div>
					<div className="hero-feature">
						<Sparkles size={16} />
						<span>Custom short links</span>
					</div>
					<div className="hero-feature">
						<ArrowDownRight size={16} />
						<span>Downloadable QR codes</span>
					</div>
				</motion.div>
			</div>
		</section>
	);
}
