import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { SignInButton, UserButton } from "@clerk/react";
import { CLERK_ENABLED, useAppAuth } from "./clerk";
import { LazyMotion, MotionConfig, domAnimation, motion, AnimatePresence } from "framer-motion";
import {
	App as AntdApp,
	Alert,
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
import { errorText, normalizeUrl, readJson, resolveExpiry, validateDestination } from "./ui";

const StatsModal = lazy(() => import("./components/StatsModal"));
import type { EditFormValues } from "./components/EditModal";
import type { ShortenFormValues, ShortenedURL } from "./types";

const { Content } = Layout;
const { Title, Paragraph } = Typography;
// Page size for the dashboard's /api/recent pagination.
const LINKS_PAGE_SIZE = 25;

const cardVariants = {
	hidden: { opacity: 0, y: 20, scale: 0.97 },
	visible: (i: number) => ({
		opacity: 1,
		y: 0,
		scale: 1,
		transition: { delay: Math.min(i, 5) * 0.04, duration: 0.25 },
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
	const [createError, setCreateError] = useState<string | null>(null);
	const [editError, setEditError] = useState<string | null>(null);
	const [linksError, setLinksError] = useState<string | null>(null);
	const linksRequest = useRef<AbortController | null>(null);
	const [recentLinks, setRecentLinks] = useState<ShortenedURL[]>([]);
	const [result, setResult] = useState<ShortenedURL | null>(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [statsModalVisible, setStatsModalVisible] = useState(false);
	const [currentShortUrl, setCurrentShortUrl] = useState<string>("");
	const [statsCode, setStatsCode] = useState<string | null>(null);
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
	// Cursor for /api/recent pagination; hasMore is false once a page comes
	// back short of the page size.
	const [linksOffset, setLinksOffset] = useState(0);
	const [hasMoreLinks, setHasMoreLinks] = useState(false);

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
				if (!signal?.aborted) setAvailableTags(data);
			}
		} catch {
			// Non-critical, silently fail
		}
	};

	const fetchRecentLinks = async (
		search?: string,
		tag?: string | null,
		signal?: AbortSignal,
		offset: number = 0,
	) => {
		if (!isAuthed) return;

		linksRequest.current?.abort();
		const controller = new AbortController();
		linksRequest.current = controller;
		const abort = () => controller.abort();
		signal?.addEventListener("abort", abort, { once: true });
		if (signal?.aborted) controller.abort();
		setTableLoading(true);
		setLinksError(null);
		try {
			const params = new URLSearchParams();
			const searchTerm = search ?? searchQuery;
			const tagFilter = tag === undefined ? filterTag : tag;
			if (searchTerm) params.set("search", searchTerm);
			if (tagFilter) params.set("tag", tagFilter);
			params.set("limit", String(LINKS_PAGE_SIZE));
			params.set("offset", String(offset));

			const url = `/api/recent${params.toString() ? "?" + params.toString() : ""}`;
			const response = await fetch(url, { headers: await authHeaders(), signal: controller.signal });
			const data = await readJson<ShortenedURL[]>(response);
			if (controller.signal.aborted) return;
			setRecentLinks((prev) => (offset > 0 ? [...prev, ...data] : data));
			setLinksOffset(offset + data.length);
			setHasMoreLinks(data.length === LINKS_PAGE_SIZE);
			await fetchTags(controller.signal);
		} catch (error) {
			if (!controller.signal.aborted) setLinksError(errorText(error));
		} finally {
			signal?.removeEventListener("abort", abort);
			if (!controller.signal.aborted) {
				setTableLoading(false);
				setLinksLoaded(true);
			}
		}
	};

	const loadMoreLinks = () => fetchRecentLinks(undefined, undefined, undefined, linksOffset);


	const handleCopy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			message.success("Copied to clipboard.");
			return true;
		} catch {
			message.error("Could not copy the link. Select the short URL and copy it manually.");
			return false;
		}
	};

	const handleShare = async (shortUrl: string) => {
		if (navigator.share) {
			try {
				await navigator.share({ title: "tinylnk", url: shortUrl });
			} catch (error) {
				if (!(error instanceof DOMException && error.name === "AbortError")) {
					message.error("Could not share this link. Try copying it instead.");
				}
			}
		} else {
			await handleCopy(shortUrl);
		}
	};

	const onFinish = async (values: ShortenFormValues) => {
		setLoading(true);
		setCreateError(null);

		try {
			const hours = resolveExpiry(values);
			const response = await fetch("/api/shorten", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// Sending the token (when signed in) makes the link *owned* by
					// this user, so only they can manage it on the dashboard.
					...(await authHeaders()),
				},
				body: JSON.stringify({
					url: normalizeUrl(values.url),
					custom_alias: values.custom_alias?.trim() || null,
					expires_in_hours: hours,
					max_clicks: values.max_clicks ? Number(values.max_clicks) : null,
					tag: values.tag?.trim() || null,
				}),
			});

			const data = await readJson<ShortenedURL>(response);
			setResult(data);
			form.resetFields();
			setShowAdvanced(false);
			message.success("Your short link is ready.");
			if (isAuthed) {
				await fetchRecentLinks();
			}
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error
					? error.message
					: "Could not create the link. Please try again.";
			setCreateError(errorMessage);
		} finally {
			setLoading(false);
		}
	};

	// The modal is self-contained (keyed per link): it fetches its own data and
	// owns the date-range state, so opening it only records which link is shown.
	const showStats = (shortCode: string, shortUrl: string) => {
		if (!isAuthed) return;
		setCurrentShortUrl(shortUrl);
		setStatsCode(shortCode);
		setStatsModalVisible(true);
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
				message.error(data.detail || "Could not delete the link. Please try again.");
				return;
			}

			message.success("Link deleted.");
			setRecentLinks((prev) => prev.filter((l) => l.short_code !== shortCode));
		} catch (error) {
			console.error("Failed to delete", error);
			message.error("Could not delete the link. Check your connection and try again.");
		}
	};

	const handleEdit = (record: ShortenedURL) => {
		if (!isAuthed) return;
		setEditingRecord(record);
		setEditError(null);
		setEditModalVisible(true);
	};

	const handleEditSave = async (shortCode: string, data: EditFormValues) => {
		if (!isAuthed) return;
		setEditLoading(true);
		setEditError(null);

		try {
			const response = await fetch(`/api/urls/${shortCode}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...await authHeaders(),
				},
				body: JSON.stringify({
					original_url: normalizeUrl(data.original_url),
					// "" clears the alias; the field is prefilled with the current
					// alias, so a tag-only edit sends it back unchanged.
					custom_alias: (data.custom_alias ?? "").trim(),
					tag: (data.tag ?? "").trim(),
					// null = leave unchanged; 0 on expiry/limit = clear it (backend).
					expires_in_hours: data.expires_in_hours ?? null,
					max_clicks: data.max_clicks ?? 0,
				}),
			});

			const updated = await readJson<ShortenedURL>(response);
			setResult((previous) => previous?.id === updated.id ? updated : previous);
			message.success("Link updated.");
			setEditModalVisible(false);
			setEditingRecord(null);
			await fetchRecentLinks();
		} catch (error) {
			console.error("Failed to update", error);
			setEditError(errorText(error));
		} finally {
			setEditLoading(false);
		}
	};

	useEffect(() => {
		if (!isAuthed) {
			linksRequest.current?.abort();
			setStatsModalVisible(false);
			setEditModalVisible(false);
			setLinksError(null);
			setTableLoading(false);
			setRecentLinks([]);
			setAvailableTags([]);
			setLinksLoaded(false);
			return;
		}

		linksRequest.current?.abort();
		setTableLoading(true);
		const controller = new AbortController();
		const timer = setTimeout(() => {
			fetchRecentLinks(searchQuery, filterTag, controller.signal);
		}, 300);

		return () => {
			clearTimeout(timer);
			controller.abort();
			linksRequest.current?.abort();
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
							<nav className="header-nav" aria-label="Account and appearance">
								<button
									className="theme-toggle"
									onClick={toggleTheme}
									aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
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
											Sign in
										</Button>
									</SignInButton>
								) : null}
							</nav>
						</div>
					</header>

					<Content className="app-content" id="main-content">
						<div className="content-wrapper">
							{/* ─── Hero ──────────────────────────────────────────────── */}
							<Hero />

							<ShortenerForm
								form={form}
								loading={loading}
								showAdvanced={showAdvanced}
								onToggleAdvanced={() => setShowAdvanced((v) => !v)}
								onSubmit={onFinish}
								validateUrlInput={validateDestination}
								error={createError}
								onDismissError={() => setCreateError(null)}
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
							{CLERK_ENABLED && !isAuthed && !authLoading && (
								<motion.section
									className="dashboard-section"
									initial={{ opacity: 0, y: 30 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: 0.3, duration: 0.5 }}
								>
									<div className="empty-state panel-surface">
										<LogIn size={44} />
										<Title level={4}>Manage this server’s links</Title>
										<Paragraph className="dashboard-subtitle">
											You can create a short link without signing in. Authorized users can sign in to edit links and view click analytics.
										</Paragraph>
										<SignInButton mode="modal"><Button type="primary">Sign in to manage links</Button></SignInButton>
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
												View recent links on this server, edit destinations, and explore click analytics.
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
											placeholder="Search URLs, aliases, or codes"
											aria-label="Search links"
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											allowClear
											className="search-input"
										/>
										{(availableTags.length > 0 || filterTag) && (
											<Select
												placeholder="Filter by tag"
												aria-label="Filter links by tag"
												allowClear
												className="tag-filter"
												value={filterTag}
												onChange={(value) => setFilterTag(value ?? null)}
												options={availableTags.map((tag) => ({
													value: tag,
													label: tag,
												}))}
											/>
										)}
									</motion.div>

									{tableLoading || !linksLoaded ? (
										<div className="table-loading" role="status">
											<Spin size="large" /><span>Loading links…</span>
										</div>
									) : linksError ? (
										<Alert type="error" showIcon title="Could not load links" description={linksError}
											action={<Button onClick={() => fetchRecentLinks()}>Try again</Button>} />
									) : recentLinks.length === 0 ? (
										<div className="empty-state panel-surface">
											<FolderOpen size={44} />
											<Title level={4}>{searchQuery || filterTag ? "No matching links" : "No links yet"}</Title>
											<Paragraph>{searchQuery || filterTag ? "Try a different search or clear your filters." : "Create a short link to start sharing and tracking clicks."}</Paragraph>
											<Button onClick={() => {
												if (searchQuery || filterTag) { setSearchQuery(""); setFilterTag(null); }
												else document.getElementById("tinylnk-url-input")?.focus();
											}}>{searchQuery || filterTag ? "Clear filters" : "Create a link"}</Button>
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
											{hasMoreLinks ? (
												<div className="links-more">
													<Button onClick={loadMoreLinks} loading={tableLoading}>
														Load more links
													</Button>
												</div>
											) : null}
										</div>
									)}
								</motion.section>
							)}

							{/* ─── Modals ─────────────────────────────────────────────── */}
							{statsModalVisible && statsCode && (
								<Suspense fallback={<div role="status" className="modal-loading-notice">Loading analytics… <Button onClick={() => setStatsModalVisible(false)}>Cancel</Button></div>}>
									<StatsModal key={statsCode} shortCode={statsCode} currentShortUrl={currentShortUrl}
										onClose={() => setStatsModalVisible(false)} getAuthHeaders={authHeaders} />
								</Suspense>
							)}
							<EditModal
								open={editModalVisible}
								record={editingRecord}
								loading={editLoading}
								error={editError}
								onClose={() => {
									if (editLoading) return;
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
