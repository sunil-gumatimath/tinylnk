import { useEffect, useMemo, useState } from "react";
import { useAuth, SignInButton, UserButton } from "@clerk/react";
import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import {
	Button,
	Form,
	Input,
	Layout,
	Select,
	Spin,
	Typography,
	message,
} from "antd";
import { FolderOpen, RefreshCw, Search, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "./ThemeProvider";
import { Hero } from "./components/Hero";
import { LinkCard } from "./components/LinkCard";
import { EditModal } from "./components/EditModal";
import { QrModal } from "./components/QrModal";
import { ShortenerForm } from "./components/ShortenerForm";
import { StatsModal } from "./components/StatsModal";
import type { EditFormValues } from "./components/EditModal";
import type { ShortenFormValues, ShortenedURL, UrlStats } from "./types";

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const cardVariants = {
	hidden: { opacity: 0, y: 20, scale: 0.97 },
	visible: (i: number) => ({
		opacity: 1,
		y: 0,
		scale: 1,
		transition: { delay: i * 0.05, duration: 0.4 },
	}),
	exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

function App() {
	const [form] = Form.useForm<ShortenFormValues>();
	const [loading, setLoading] = useState(false);
	const [tableLoading, setTableLoading] = useState(false);
	const [statsLoading, setStatsLoading] = useState(false);
	const [recentLinks, setRecentLinks] = useState<ShortenedURL[]>([]);
	const [result, setResult] = useState<ShortenedURL | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [statsModalVisible, setStatsModalVisible] = useState(false);
	const [currentShortUrl, setCurrentShortUrl] = useState<string>("");
	const [currentStats, setCurrentStats] = useState<UrlStats | null>(null);
	const [qrModalVisible, setQrModalVisible] = useState(false);
	const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);
	const { isDark, toggleTheme } = useTheme();
	const { isSignedIn, getToken } = useAuth();

	// New state for features
	const [editModalVisible, setEditModalVisible] = useState(false);
	const [editLoading, setEditLoading] = useState(false);
	const [editingRecord, setEditingRecord] = useState<ShortenedURL | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [filterTag, setFilterTag] = useState<string | null>(null);
	const [availableTags, setAvailableTags] = useState<string[]>([]);

	const currentHost = window.location.origin;
	const getShortUrl = useMemo(
		() =>
			(record: Pick<ShortenedURL, "short_url" | "short_code">) =>
				record.short_url || `${currentHost}/${record.short_code}`,
		[currentHost],
	);

	/** Build Clerk-authenticated headers for admin-protected requests. */
	const authHeaders = async (): Promise<Record<string, string>> => {
		const headers: Record<string, string> = {};
		if (isSignedIn) {
			const token = await getToken();
			if (token) headers["Authorization"] = `Bearer ${token}`;
		}
		return headers;
	};

	const fetchTags = async (signal?: AbortSignal) => {
		try {
			const response = await fetch("/api/tags", {
				headers: await authHeaders(),
				signal,
			});
			if (response.ok) {
				const data = await response.json();
				setAvailableTags(data);
			}
		} catch {
			// Non-critical, silently fail
		}
	};

	const fetchRecentLinks = async (
		search?: string,
		tag?: string | null,
		signal?: AbortSignal,
	) => {
		if (!isSignedIn) return;

		setTableLoading(true);
		try {
			const params = new URLSearchParams();
			const searchTerm = search ?? searchQuery;
			const tagFilter = tag === undefined ? filterTag : tag;
			if (searchTerm) params.set("search", searchTerm);
			if (tagFilter) params.set("tag", tagFilter);

			const url = `/api/recent${params.toString() ? "?" + params.toString() : ""}`;
			const response = await fetch(url, { headers: await authHeaders(), signal });

			if (!response.ok) {
				message.error("Could not load recent links.");
				return;
			}

			const data = await response.json();
			setRecentLinks(data);

			// Also fetch tags
			await fetchTags();
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			console.error("Failed to fetch recent links", error);
			message.error("Could not load recent links.");
		} finally {
			setTableLoading(false);
		}
	};

	const validateUrlInput = async (_rule: unknown, value: string) => {
		if (!value) return Promise.resolve();

		const normalized =
			value.startsWith("http://") || value.startsWith("https://")
				? value
				: `https://${value}`;

		try {
			const parsed = new URL(normalized);
			if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
				throw new Error("Invalid domain");
			}
			return Promise.resolve();
		} catch {
			return Promise.reject(new Error("Must be a valid URL with a domain."));
		}
	};


	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			message.success("Copied to clipboard.");
		} catch {
			message.error("Could not copy. Please copy manually.");
		}
	};

	const handleShare = async (shortUrl: string) => {
		if (navigator.share) {
			try {
				await navigator.share({ title: "tinylnk", url: shortUrl });
			} catch {
				// User cancelled share
			}
		} else {
			await handleCopy(shortUrl);
		}
	};

	const onFinish = async (values: ShortenFormValues) => {
		setLoading(true);
		setResult(null);

		try {
			const response = await fetch("/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: values.url,
					custom_alias: values.custom_alias?.trim() || null,
					expires_in_hours: values.expires_in_hours
						? Number(values.expires_in_hours)
						: null,
					max_clicks: values.max_clicks ? Number(values.max_clicks) : null,
					tag: values.tag?.trim() || null,
				}),
			});

			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.detail || "Failed to shorten URL.");
			}

			setResult(data);
			form.resetFields();
			message.success("URL shortened successfully.");
			if (isSignedIn) {
				await fetchRecentLinks();
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "An unexpected error occurred.";
			message.error(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	const showStats = async (shortCode: string, shortUrl: string) => {
		if (!isSignedIn) return;

		setCurrentShortUrl(shortUrl);
		setStatsModalVisible(true);
		setStatsLoading(true);
		setCurrentStats(null);

		try {
			const response = await fetch(`/api/stats/${shortCode}`, {
				headers: await authHeaders(),
			});

			if (!response.ok) {
				message.error("Failed to fetch stats.");
				setStatsModalVisible(false);
				return;
			}

			const data = await response.json();
			setCurrentStats(data);
		} catch (error) {
			console.error("Failed to fetch stats", error);
			message.error("An error occurred while loading stats.");
			setStatsModalVisible(false);
		} finally {
			setStatsLoading(false);
		}
	};

	const handleStatsDateChange = async (
		startDate: string | null,
		endDate: string | null,
	) => {
		if (!currentStats || !isSignedIn) return;

		setStatsLoading(true);

		try {
			const params = new URLSearchParams();
			if (startDate) params.set("start_date", startDate);
			if (endDate) params.set("end_date", endDate);

			const url = `/api/stats/${currentStats.short_code}${params.toString() ? "?" + params.toString() : ""}`;
			const response = await fetch(url, { headers: await authHeaders() });
			if (response.ok) {
				const data = await response.json();
				setCurrentStats(data);
			}
		} catch (error) {
			console.error("Failed to fetch filtered stats", error);
		} finally {
			setStatsLoading(false);
		}
	};

	const handleDelete = async (shortCode: string) => {
		if (!isSignedIn) return;

		try {
			const response = await fetch(`/api/urls/${shortCode}`, {
				method: "DELETE",
				headers: await authHeaders(),
			});

			if (!response.ok) {
				const data = await response.json();
				message.error(data.detail || "Failed to delete link.");
				return;
			}

			message.success("Link deleted.");
			setRecentLinks((prev) => prev.filter((l) => l.short_code !== shortCode));
		} catch (error) {
			console.error("Failed to delete", error);
			message.error("An error occurred while deleting.");
		}
	};

	const handleEdit = (record: ShortenedURL) => {
		if (!isSignedIn) return;
		setEditingRecord(record);
		setEditModalVisible(true);
	};

	const handleEditSave = async (shortCode: string, data: EditFormValues) => {
		if (!isSignedIn) return;
		setEditLoading(true);

		try {
			const response = await fetch(`/api/urls/${shortCode}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...await authHeaders(),
				},
				body: JSON.stringify({
					original_url: data.original_url || null,
					custom_alias: data.custom_alias?.trim() || null,
					tag: data.tag?.trim() || null,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				message.error(errorData.detail || "Failed to update.");
				setEditModalVisible(false);
				return;
			}

			message.success("Link updated.");
			setEditModalVisible(false);
			setEditingRecord(null);
			await fetchRecentLinks();
		} catch (error) {
			console.error("Failed to update", error);
			message.error("An error occurred while updating.");
		} finally {
			setEditLoading(false);
		}
	};

	useEffect(() => {
		if (!isSignedIn) {
			setRecentLinks([]);
			setAvailableTags([]);
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(() => {
			fetchRecentLinks(searchQuery, filterTag, controller.signal);
		}, 300);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isSignedIn, searchQuery, filterTag]);

	return (
		<MotionConfig reducedMotion="user">
			<LazyMotion features={domAnimation}>
				<Layout className={`app-layout ${isDark ? "dark" : "light"}`}>
					{/* ─── Header ─────────────────────────────────────────────── */}
					<header className="app-header">
						<div className="header-inner">
							<a href="/" className="logo">
								tinylnk
							</a>
							<nav className="header-nav">
								<button
									className="theme-toggle"
									onClick={toggleTheme}
									aria-label="Toggle theme"
								>
									{isDark ? <Sun size={18} /> : <Moon size={18} />}
								</button>
								{isSignedIn ? (
									<UserButton />
								) : (
									<SignInButton mode="modal">
										<Button type="primary" ghost>
											Sign In
										</Button>
									</SignInButton>
								)}
							</nav>
						</div>
					</header>

					<Content className="app-content">
						<div className="content-wrapper">
							{/* ─── Hero ──────────────────────────────────────────────── */}
							<Hero />

							<ShortenerForm
								form={form}
								loading={loading}
								showAdvanced={showAdvanced}
								onToggleAdvanced={() => setShowAdvanced((v) => !v)}
								onSubmit={onFinish}
								validateUrlInput={validateUrlInput}
								result={result}
								onCopy={handleCopy}
								onShowQr={(shortCode) => {
									setCurrentQrUrl(shortCode);
									setQrModalVisible(true);
								}}
								getShortUrl={getShortUrl}
							/>

							{isSignedIn && (
								<motion.section
									className="dashboard-section"
									initial={{ opacity: 0, y: 30 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3, duration: 0.5 }}
								>
									<div className="dashboard-header">
										<div className="dashboard-header-info">
											<Title level={2} className="dashboard-title">
												Dashboard
											</Title>
											<Paragraph className="dashboard-subtitle">
												Manage your shortened URLs
											</Paragraph>
										</div>
										<Button
											onClick={() => fetchRecentLinks()}
											loading={tableLoading}
											icon={<RefreshCw size={16} />}
										>
											Refresh
										</Button>
									</div>

									<motion.div className="search-toolbar" layout>
										<Input
											prefix={<Search size={16} />}
											placeholder="Search URLs..."
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											allowClear
											className="search-input"
										/>
										{availableTags.length > 0 && (
											<Select
												placeholder="Filter by tag"
												allowClear
												className="tag-filter"
												value={filterTag}
												onChange={(value) => setFilterTag(value)}
												options={availableTags.map((tag) => ({
													value: tag,
													label: tag,
												}))}
											/>
										)}
									</motion.div>

									{tableLoading ? (
										<div className="table-loading">
											<Spin size="large" />
										</div>
									) : recentLinks.length === 0 ? (
										<div className="empty-state panel-surface">
											<FolderOpen size={44} />
											<Title level={4}>No links yet</Title>
										</div>
									) : (
										<div className="links-grid">
											<AnimatePresence mode="popLayout">
												{recentLinks.map((link, index) => (
													<motion.div
														key={link.short_code}
														custom={index}
														variants={cardVariants}
														initial="hidden"
														animate="visible"
														exit="exit"
														layout
													>
														<LinkCard
															record={link}
															getShortUrl={getShortUrl}
															onCopy={handleCopy}
															onShare={handleShare}
															onShowStats={showStats}
															onDelete={handleDelete}
															onEdit={handleEdit}
															onShowQr={(shortCode) => {
																setCurrentQrUrl(shortCode);
																setQrModalVisible(true);
															}}
														/>
													</motion.div>
												))}
											</AnimatePresence>
										</div>
									)}
								</motion.section>
							)}

							{/* ─── Modals ─────────────────────────────────────────────── */}
							<StatsModal
								open={statsModalVisible}
								currentShortUrl={currentShortUrl}
								stats={currentStats}
								loading={statsLoading}
								onClose={() => setStatsModalVisible(false)}
								onDateRangeChange={handleStatsDateChange}
							/>
							<EditModal
								open={editModalVisible}
								record={editingRecord}
								loading={editLoading}
								onClose={() => {
									setEditModalVisible(false);
									setEditingRecord(null);
								}}
								onSave={handleEditSave}
							/>

							<QrModal
								open={qrModalVisible}
								currentQrUrl={currentQrUrl}
								onClose={() => {
									setQrModalVisible(false);
									setCurrentQrUrl(null);
								}}
							/>
						</div>
					</Content>
				</Layout>
			</LazyMotion>
		</MotionConfig>
	);
}

export default App;
