import { useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Select } from "antd";
import {
	Check,
	ChevronDown,
	ChevronUp,
	ExternalLink,
	ScanQrCode,
	Sparkles,
} from "lucide-react";
import { LinkIcon } from "./LinkIcon";
import type { FormInstance } from "antd/es/form";
import type { ShortenFormValues, ShortenedURL } from "../types";

interface ShortenerFormProps {
	form: FormInstance<ShortenFormValues>;
	loading: boolean;
	showAdvanced: boolean;
	result: ShortenedURL | null;
	onSubmit: (values: ShortenFormValues) => Promise<void>;
	onToggleAdvanced: () => void;
	onCopy: (value: string) => Promise<boolean>;
	onShowQr: (shortCode: string) => void;
	getShortUrl: (
		record: Pick<ShortenedURL, "short_url" | "short_code">,
	) => string;
	validateUrlInput: (_rule: unknown, value: string) => Promise<void>;
	/** Submission failure shown inside the panel; null/undefined hides it. */
	error?: string | null;
	onDismissError?: () => void;
}

export function ShortenerForm({
	form,
	loading,
	showAdvanced,
	result,
	onSubmit,
	onToggleAdvanced,
	onCopy,
	onShowQr,
	getShortUrl,
	validateUrlInput,
	error,
	onDismissError,
}: ShortenerFormProps) {
	const [copied, setCopied] = useState(false);
	// Derived from the form value instead of mirrored state: the custom input
	// shows only while the Select holds the "Custom…" sentinel, so it resets
	// automatically when a preset is chosen or the form is cleared.
	const showCustomExpiry = Form.useWatch("expires_in_hours", form) === "CUSTOM";
	const handleCopyClick = async (url: string) => {
		const succeeded = await onCopy(url);
		setCopied(succeeded);
		if (succeeded) setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section id="shorten-form" className="composer-section">
			<div className="section-heading">
				<h2>Create a short link</h2>
				<p>Paste your destination URL. Customize your link with the optional settings.</p>
			</div>

			<div className="composer-layout">
				<div className="panel-surface composer-panel">
					{error ? (
						<Alert
							className="form-error"
							type="error"
							showIcon
							message={error}
							closable
							onClose={onDismissError}
						/>
					) : null}

					<Form
						form={form}
						layout="vertical"
						onFinish={onSubmit}
						className="shortener-form"
					>
						<Form.Item
							name="url"
							label="Destination URL"
							rules={[
								{ required: true, message: "Enter the URL you want to shorten." },
								{ validator: validateUrlInput },
							]}
						>
							<Input
								size="large"
								id="tinylnk-url-input"
								placeholder="https://example.com/launch/landing-page"
								prefix={<LinkIcon size={20} style={{ marginRight: "8px" }} />}
							/>
						</Form.Item>

						<div className="form-submit-row">
							<Button
								type="primary"
								htmlType="submit"
								size="large"
								loading={loading}
								className="primary-button"
							>
								Create short link
							</Button>
							<button
								type="button"
								className="advanced-toggle"
								onClick={onToggleAdvanced}
								aria-expanded={showAdvanced}
								aria-controls="advanced-options"
							>
								{showAdvanced ? (
									<ChevronUp size={16} />
								) : (
									<ChevronDown size={16} />
								)}
								{showAdvanced
									? "Hide link options"
									: "Show link options"}
							</button>
						</div>

						{showAdvanced ? (
							<div className="advanced-grid" id="advanced-options">
								<Form.Item name="custom_alias" label="Custom alias (optional)" extra="Choose the text after the slash: 3–50 letters, numbers, hyphens, or underscores.">
									<Input placeholder="spring-launch" />
								</Form.Item>
								<Form.Item
									name="expires_in_hours"
									label="Expires in"
									extra="The link stops redirecting when it expires. Leave blank for no expiry."
								>
									<Select
										allowClear
										placeholder="Never expires"
										options={[
											{ label: "30 minutes", value: 0.5 },
											{ label: "1 hour", value: 1 },
											{ label: "6 hours", value: 6 },
											{ label: "12 hours", value: 12 },
											{ label: "1 day", value: 24 },
											{ label: "3 days", value: 72 },
											{ label: "7 days", value: 168 },
											{ label: "30 days", value: 720 },
											{ label: "Custom duration…", value: "CUSTOM" },
										]}
										onChange={(val) => {
											if (val !== "CUSTOM") {
												// Never reuse hours typed for the custom mode.
												form.setFieldValue("custom_expires_in_hours", undefined);
											}
										}}
									/>
								</Form.Item>
								{showCustomExpiry ? (
									<Form.Item
										name="custom_expires_in_hours"
										label="Duration in hours"
										rules={[{ required: true, message: "Enter a duration between 1 and 8,760 hours." }]}
									>
										<InputNumber
											style={{ width: "100%" }}
											min={1}
											max={8760}
											placeholder="e.g. 48"
										/>
									</Form.Item>
								) : null}
								<Form.Item
									name="max_clicks"
									label="Click limit (optional)"
									extra="The link stops redirecting once it reaches this many clicks. Leave blank for no limit."
								>
									<InputNumber
										style={{ width: "100%" }}
										min={1}
										placeholder="250"
									/>
								</Form.Item>
								<Form.Item name="tag" label="Tag (optional)" extra="Group related links, such as a campaign or project.">
									<Input placeholder="marketing" />
								</Form.Item>
							</div>
						) : null}
					</Form>
				</div>

				<div
					className="result-container"
					style={{ display: "flex", flexDirection: "column" }}
				>
					{result ? (
						<div className="result-panel panel-surface result-panel--flex">
							<div className="result-header">
								<span className="result-badge">Short link</span>
								<span className="result-title">
									Your short link
								</span>
							</div>
							<div className="result-link">{getShortUrl(result)}</div>
							<div className="result-origin truncate-text">
								{result.original_url}
							</div>
							<div className="result-actions">
								<Button
									onClick={() => handleCopyClick(getShortUrl(result))}
									icon={copied ? <Check size={16} color="green" /> : undefined}
								>
									{copied ? "Copied!" : "Copy link"}
								</Button>
								<Button
									icon={<ScanQrCode size={16} />}
									onClick={() => onShowQr(result.short_code)}
								>
									Show QR code
								</Button>
								<Button
									icon={<ExternalLink size={16} />}
									href={getShortUrl(result)}
									target="_blank"
									rel="noopener noreferrer"
								>
									Open link
								</Button>
							</div>
						</div>
					) : (
						<div className="empty-state--centered panel-surface">
							<Sparkles
								size={40}
								strokeWidth={1}
								color="var(--text-muted)"
								className="empty-state__icon"
							/>
							<h3>Ready when you are</h3>
							<p className="empty-state__hint">
								Create a short link, then copy it or download a QR code to share.
							</p>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
