import { motion } from "framer-motion";
import { ArrowDownRight, ShieldCheck, Sparkles } from "lucide-react";

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
		<section className="hero-section">
			<div className="hero-copy">
				<motion.div
					className="hero-badge"
					custom={0}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					<Sparkles size={14} />
					<span>Open-source · self-hosted</span>
				</motion.div>

				<motion.h1
					custom={1}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					Shorten links.{" "}
					<span className="text-gradient">Make sharing simple.</span>
				</motion.h1>

				<motion.p
					className="hero-subtitle"
					custom={2}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					Create short links and share them as URLs or QR codes.
					Self-host tinylnk to manage links and view click analytics on your server.
				</motion.p>

				<motion.div
					className="hero-features"
					custom={3}
					variants={fadeUp}
					initial="hidden"
					animate="visible"
				>
					<div className="hero-feature">
						<ShieldCheck size={16} />
						<span>Click analytics</span>
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
