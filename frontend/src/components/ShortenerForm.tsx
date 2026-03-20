import { Button, Form, Input, InputNumber } from 'antd';
import { ChevronDown, ChevronUp, Link2, ScanQrCode } from 'lucide-react';
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
  return (
    <section id="shorten-form" className="composer-section">
      <div className="section-heading">
        <span className="section-kicker">Core action</span>
        <h2>Make the shortest path the clearest path.</h2>
        <p>Keep the main form simple, then reveal advanced controls only when needed.</p>
      </div>

      <div className="composer-layout">
        <div className="panel-surface composer-panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Shorten a URL</span>
              <h3>Fast input, better defaults</h3>
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
                prefix={<Link2 size={18} />}
              />
            </Form.Item>

            <div className="form-submit-row">
              <Button type="primary" htmlType="submit" size="large" loading={loading} className="primary-button">
                Shorten link
              </Button>
              <button type="button" className="advanced-toggle" onClick={onToggleAdvanced}>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
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

        <div className="panel-surface guidance-panel">
          <div className="panel-header">
            <div>
              <span className="panel-label">Design notes</span>
              <h3>Why this feels better</h3>
            </div>
          </div>
          <ul className="guidance-list">
            <li>The input is now the visual hero, not one of several competing elements.</li>
            <li>Advanced settings behave like optional controls, which keeps the page calmer.</li>
            <li>Ant Design still powers interactions, but the surface styling no longer looks default.</li>
          </ul>

          {result ? (
            <div className="result-panel">
              <div className="result-header">
                <span className="result-badge">Live result</span>
                <span className="result-title">Your new short link is ready</span>
              </div>
              <div className="result-link">{getShortUrl(result)}</div>
              <div className="result-origin">{result.original_url}</div>
              <div className="result-actions">
                <Button onClick={() => onCopy(getShortUrl(result))}>Copy link</Button>
                <Button icon={<ScanQrCode size={16} />} onClick={() => onShowQr(result.short_code)}>
                  Show QR
                </Button>
              </div>
            </div>
          ) : (
            <div className="result-placeholder">
              The success state will appear here with copy and QR actions as soon as a link is created.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
