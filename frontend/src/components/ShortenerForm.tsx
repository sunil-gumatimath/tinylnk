import { useState } from "react";
import { Button, Form, Input, InputNumber, Select } from "antd";
import {
	Check,
	ChevronDown,
	ChevronUp,
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
	onCopy: (value: string) => Promise<void>;
	onShowQr: (shortCode: string) => void;
	getShortUrl: (
		record: Pick<ShortenedURL, "short_url" | "short_code">,
	) => string;
	validateUrlInput: (_rule: unknown, value: string) => Promise<void>;
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
}: ShortenerFormProps) {
	const [copied, setCopied] = useState(false);
	const [showCustomExpiry, setShowCustomExpiry] = useState(false);
	const handleCopyClick = async (url: string) => {
		await onCopy(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<section id="shorten-form" className="composer-section">
			<div className="section-heading">
				<span className="section-kicker">Quick Create</span>
				<h2>Enter your destination URL</h2>
				<p>
					Enter a long URL to create a short, trackable link. Add an alias,
					expiry, click limit, or tag, then generate a QR code after creation.
				</p>
			</div>

			<div className="composer-layout">
				<div className="panel-surface composer-panel">
					<div className="panel-header">
						<div>
							<span className="panel-label">Create a link</span>
							<h3>Link settings</h3>
						</div>
					</div>

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
								{ required: true, message: "Please input a URL." },
								{ validator: validateUrlInput },
							]}
						>
							<Input
								size="large"
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
							>
								{showAdvanced ? (
									<ChevronUp size={16} />
								) : (
									<ChevronDown size={16} />
								)}
								{showAdvanced
									? "Hide advanced controls"
									: "Configure link options"}
							</button>
						</div>

						{showAdvanced ? (
							<div className="advanced-grid">
								<Form.Item name="custom_alias" label="Custom alias">
									<Input placeholder="spring-launch" />
								</Form.Item>
								<Form.Item
									name="expires_in_hours"
									label="Expires in"
									extra="Leave blank for no expiry."
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
											{ label: "Custom...", value: "CUSTOM" },
										]}
										onChange={(val) => {
											if (val === "CUSTOM") {
												setShowCustomExpiry(true);
												form.setFieldValue("expires_in_hours", undefined);
											} else {
												setShowCustomExpiry(false);
												form.setFieldValue("expires_in_hours", val ?? undefined);
											}
										}}
									/>
								</Form.Item>
								{showCustomExpiry ? (
									<Form.Item
										name="expires_in_hours"
										label="Custom hours"
										rules={[{ required: true, message: "Enter hours" }]}
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
									label="Max clicks"
									extra="Leave blank for no limit."
								>
									<InputNumber
										style={{ width: "100%" }}
										min={1}
										placeholder="250"
									/>
								</Form.Item>
								<Form.Item name="tag" label="Tag">
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
						<div
							className="result-panel panel-surface"
							style={{
								flex: 1,
								margin: 0,
								display: "flex",
								flexDirection: "column",
								justifyContent: "center",
							}}
						>
							<div className="result-header">
								<span className="result-badge">Live result</span>
								<span className="result-title">
									Your short link is ready to share
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
									Show QR
								</Button>
							</div>
						</div>
					) : (
						<div
							className="empty-state panel-surface"
							style={{
								flex: 1,
								display: "flex",
								flexDirection: "column",
								justifyContent: "center",
								alignItems: "center",
							}}
						>
							<Sparkles
								size={40}
								strokeWidth={1}
								color="var(--text-muted)"
								style={{ marginBottom: "16px" }}
							/>
							<h3 style={{ margin: 0 }}>Instant Link Generation</h3>
							<p style={{ margin: "8px 0 0 0" }}>
								Your customized short link and downloadable QR code will appear
								here the moment you hit create.
							</p>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
