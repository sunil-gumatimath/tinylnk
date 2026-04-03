import { useState } from 'react';
import { Button, Form, Input, InputNumber } from 'antd';
import { Check, ChevronDown, ChevronUp, ScanQrCode, Sparkles } from 'lucide-react';
import { LinkIcon } from './LinkIcon';
import type { FormInstance } from 'antd/es/form';
import type { ShortenFormValues, ShortenedURL } from '../types';

interface ShortenerFormProps {
  form: FormInstance<ShortenFormValues>;
  loading: boolean;
  showAdvanced: boolean;
  result: ShortenedURL | null;
  onSubmit: (values: ShortenFormValues) => Promise<void>;
  onToggleAdvanced: () => void;
  onCopy: (value: string) => Promise<void>;
  onShowQr: (shortCode: string) => void;
  getShortUrl: (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) => string;
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
        <p>Enter your long URL below to instantly generate a trackable short link. Expand settings for custom aliases, expiration dates, and QR codes.</p>
      </div>

      <div className="composer-layout">
        <div className="panel-surface composer-panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Quick Create</span>
              <h3>Enter your destination URL</h3>
            </div>
          </div>

          <Form form={form} layout="vertical" onFinish={onSubmit} className="shortener-form">
            <Form.Item
              name="url"
              label="Destination URL"
              rules={[
                { required: true, message: 'Please input a URL.' },
                { validator: validateUrlInput },
              ]}
            >
              <Input
                size="large"
                placeholder="https://example.com/launch/landing-page"
                prefix={<LinkIcon className="w-5 h-5 text-gray-500" style={{ marginRight: '8px' }} />}
              />
            </Form.Item>

            <div className="form-submit-row">
              <Button type="primary" htmlType="submit" size="large" loading={loading} className="primary-button">
                Create short link
              </Button>
              <button type="button" className="advanced-toggle" onClick={onToggleAdvanced}>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAdvanced ? 'Hide advanced controls' : 'Configure link options'}
              </button>
            </div>

            {showAdvanced ? (
              <div className="advanced-grid">
                <Form.Item name="custom_alias" label="Custom alias">
                  <Input placeholder="spring-launch" />
                </Form.Item>
                <Form.Item name="expires_in_hours" label="Expires in hours">
                  <InputNumber style={{ width: '100%' }} min={1} max={8760} placeholder="24" />
                </Form.Item>
                <Form.Item name="max_clicks" label="Max clicks">
                  <InputNumber style={{ width: '100%' }} min={1} placeholder="250" />
                </Form.Item>
                <Form.Item name="tag" label="Tag">
                  <Input placeholder="marketing" />
                </Form.Item>
              </div>
            ) : null}
          </Form>
        </div>

        <div className="result-container" style={{ display: 'flex', flexDirection: 'column' }}>
          {result ? (
            <div className="result-panel panel-surface" style={{ flex: 1, margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="result-header">
                <span className="result-badge">Live result</span>
                <span className="result-title">Your short link is ready to share</span>
              </div>
              <div className="result-link">{getShortUrl(result)}</div>
              <div className="result-origin truncate-text">{result.original_url}</div>
              <div className="result-actions">
                <Button onClick={() => handleCopyClick(getShortUrl(result))} icon={copied ? <Check size={16} color="green" /> : undefined}>
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
                <Button icon={<ScanQrCode size={16} />} onClick={() => onShowQr(result.short_code)}>
                  Show QR
                </Button>
              </div>
            </div>
          ) : (
            <div className="empty-state panel-surface" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <Sparkles size={40} strokeWidth={1} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
              <h3 style={{ margin: 0 }}>Instant Link Generation</h3>
              <p style={{ margin: '8px 0 0 0' }}>Your customized short link and downloadable QR code will appear here the moment you hit create.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// TODO: Add loading spinner during API calls

// TODO: Add client-side URL validation

// TODO: Add React Hook Form for form state

// TODO: Add live region for screen readers

// TODO: Add React Hook Form for better form state management
