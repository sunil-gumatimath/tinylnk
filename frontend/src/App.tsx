import { useEffect, useMemo, useState } from "react";
import { SignInButton, UserButton } from "@clerk/react";
import { CLERK_ENABLED, useAppAuth } from "./clerk";
import { LazyMotion, MotionConfig, domAnimation, motion, AnimatePresence } from "framer-motion";
import {
	App as AntdApp,
	Button,
	Form,
	Input,
	Layout,
	Select,
	Spin,
	Typography,
} from "antd";
import { FolderOpen, LogIn, RefreshCw, Search, Sun, Moon } from "lucide-react";
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
	// Themed message API — the static `message.*` export cannot see the
	// ConfigProvider theme and renders light toasts in dark mode.
	const { message } = AntdApp.useApp();
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
	const [currentQrCode, setCurrentQrCode] = useState<string | null>(null);
	const { isDark, toggleTheme } = useTheme();
	const { isSignedIn, getToken } = useAppAuth();
	// Clerk reports `undefined` until it finishes loading — treat that as
	// "unknown" so the header doesn't flash the signed-out controls.
	const authLoading = CLERK_ENABLED && isSignedIn === undefined;

	const isAuthed = !authLoading && isSignedIn === true;

	// New state for features
	const [editModalVisible, setEditModalVisible] = useState(false);
	const [editLoading, setEditLoading] = useState(false);
	const [editingRecord, setEditingRecord] = useState<ShortenedURL | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [filterTag, setFilterTag] = useState<string | null>(null);
	const [availableTags, setAvailableTags] = useState<string[]>([]);
	// True once the first dashboard fetch settles — keeps the "No links
	// yet" empty state from flashing before results arrive.
	const [linksLoaded, setLinksLoaded] = useState(false);

	const currentHost = window.location.origin;
	const getShortUrl = useMemo(
		() =>
			(record: Pick<ShortenedURL, "short_url" | "short_code">) =>
				record.short_url || `${currentHost}/${record.short_code}`,
		[currentHost],
	);

	/** Auth headers for admin-protected requests: Clerk JWT only. */
	const authHeaders = async (): Promise<Record<string, string>> => {
		const headers: Record<string, string> = {};
		if (isSignedIn) {
			const token = await getToken();
			if (token) {
				headers["Authorization"] = `Bearer ${token}`;
			}
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
		if (!isAuthed) return;

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
			setLinksLoaded(true);
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
			const hours =
				values.expires_in_hours != null
					? Number(values.expires_in_hours)
					: values.custom_expires_in_hours != null
						? Number(values.custom_expires_in_hours)
						: null;
			const response = await fetch("/api/shorten", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					url: values.url,
					custom_alias: values.custom_alias?.trim() || null,
					expires_in_hours: hours,
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
			if (isAuthed) {
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
		if (!isAuthed) return;

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
		if (!currentStats || !isAuthed) return;

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
		if (!isAuthed) return;

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
		if (!isAuthed) return;
		setEditingRecord(record);
		setEditModalVisible(true);
	};

	const handleEditSave = async (shortCode: string, data: EditFormValues) => {
		if (!isAuthed) return;
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
					// "" clears the alias; the field is prefilled with the current
					// alias, so a tag-only edit sends it back unchanged.
					custom_alias: (data.custom_alias ?? "").trim(),
					tag: (data.tag ?? "").trim(),
					// null = leave unchanged; 0 on expiry/limit = clear it (backend).
					expires_in_hours: data.expires_in_hours ?? null,
					max_clicks: data.max_clicks ?? 0,
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
		if (!isAuthed) {
			setRecentLinks([]);
			setAvailableTags([]);
			setLinksLoaded(false);
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
	}, [isAuthed, searchQuery, filterTag]);

	// Ctrl+K / Cmd+K focuses the URL input (Escape closes AntD modals natively).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
				const target = e.target as HTMLElement | null;
				if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
				e.preventDefault();
				document.getElementById("tinylnk-url-input")?.focus();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

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
								{authLoading ? (
									<Spin size="small" />
								) : isSignedIn ? (
									<UserButton />
								) : CLERK_ENABLED ? (
									<SignInButton mode="modal">
										<Button type="primary" ghost>
											Sign In
										</Button>
									</SignInButton>
								) : null}
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
									setCurrentQrCode(shortCode);
									setQrModalVisible(true);
								}}
								getShortUrl={getShortUrl}
							/>

							{/* Signed-out visitors can still shorten links, but the
							    dashboard (search, cards, analytics) needs auth — say so
							    instead of silently hiding it. */}
							{!isAuthed && !authLoading && (
								<motion.section
									className="dashboard-section"
									initial={{ opacity: 0, y: 30 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3, duration: 0.5 }}
								>
									<div className="empty-state panel-surface">
										<LogIn size={44} />
										<Title level={4}>Sign in to manage your links</Title>
										<Paragraph className="dashboard-subtitle">
											Links you create above keep working. Sign in
											to see click analytics, edit, and delete them.
										</Paragraph>
									</div>
								</motion.section>
							)}

							{isAuthed && (
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

									{tableLoading || !linksLoaded ? (
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
																setCurrentQrCode(shortCode);
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
								getAuthHeaders={authHeaders}
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
								shortCode={currentQrCode}
								onClose={() => {
									setQrModalVisible(false);
									setCurrentQrCode(null);
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
