import { useState, useEffect, type ReactNode } from 'react';
import { Layout, Typography, Form, Input, InputNumber, Button, message, Modal, Popconfirm, ConfigProvider, theme, Spin } from 'antd';
import { Scissors, Copy, RotateCw, BarChart2, Trash2, QrCode, ChevronDown, ChevronUp, Globe, Monitor, Link2, MousePointerClick, Calendar, Tag as TagIcon, ExternalLink, Zap, Shield, ChartNoAxesCombined } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const { Content } = Layout;
const { Title } = Typography;

const COLORS = ['#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#34d399', '#3b82f6', '#f43f5e'];

interface ShortenedURL {
  id: number;
  original_url: string;
  short_code: string;
  short_url: string;
  created_at: string;
  expires_at: string | null;
  max_clicks: number | null;
  tag: string | null;
  click_count: number;
}

interface ClickEvent {
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
}

interface StatsItem {
  name: string;
  value: number;
}

interface UrlStats {
  original_url: string;
  short_code: string;
  created_at: string;
  expires_at: string | null;
  max_clicks: number | null;
  tag: string | null;
  total_clicks: number;
  clicks_by_date: StatsItem[];
  browser_stats: StatsItem[];
  os_stats: StatsItem[];
  recent_clicks: ClickEvent[];
}

interface ShortenFormValues {
  url: string;
  custom_alias?: string;
  expires_in_hours?: number;
  max_clicks?: number;
  tag?: string;
}

interface BrowserCardProps {
  label: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

function BrowserCard({ label, className = '', bodyClassName = '', children }: BrowserCardProps) {
  return (
    <div className={`browser-card glass ${className}`.trim()}>
      <div className="browser-card-header">
        <span className="browser-card-dot"></span>
        <span className="browser-card-dot"></span>
        <span className="browser-card-dot"></span>
        <span className="browser-card-label">{label}</span>
      </div>
      <div className={`browser-card-body ${bodyClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

function App() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShortenedURL | null>(null);
  const [recentLinks, setRecentLinks] = useState<ShortenedURL[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [currentStats, setCurrentStats] = useState<UrlStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);

  const fetchRecentLinks = async () => {
    setTableLoading(true);
    try {
      const res = await fetch('/api/recent');
      if (!res.ok) {
        message.error('Could not load recent links');
        return;
      }
      const data = await res.json();
      setRecentLinks(data);
    } catch (error) {
      console.error('Failed to fetch recent links', error);
      message.error('Could not load recent links');
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentLinks();
  }, []);

  const validateUrlInput = async (_rule: unknown, value: string) => {
    if (!value) return Promise.resolve();

    const normalized = value.startsWith('http://') || value.startsWith('https://')
      ? value
      : `https://${value}`;

    try {
      // eslint-disable-next-line no-new
      new URL(normalized);
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error('Must be a valid URL or domain'));
    }
  };

  const scrollToShortenForm = () => {
    document.getElementById('shorten-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onFinish = async (values: ShortenFormValues) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: values.url,
          custom_alias: values.custom_alias ? values.custom_alias.trim() : null,
          expires_in_hours: values.expires_in_hours ? Number(values.expires_in_hours) : null,
          max_clicks: values.max_clicks ? Number(values.max_clicks) : null,
          tag: values.tag ? values.tag.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to shorten URL');
      }

      setResult(data);
      message.success('URL shortened successfully!');
      fetchRecentLinks();
      form.resetFields();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const currentHost = window.location.origin;

  const getShortUrl = (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) =>
    record.short_url || `${currentHost}/${record.short_code}`;

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Copied to clipboard!');
    } catch {
      message.error('Could not copy. Please copy manually.');
    }
  };

  const showStats = async (shortCode: string) => {
    setStatsModalVisible(true);
    setStatsLoading(true);
    try {
      const res = await fetch(`/api/stats/${shortCode}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStats(data);
      } else {
        message.error("Failed to fetch stats");
        setStatsModalVisible(false);
      }
    } catch (error) {
      message.error("An error occurred");
      setStatsModalVisible(false);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleDelete = async (shortCode: string) => {
    try {
      const res = await fetch(`/api/urls/${shortCode}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        message.success('Link deleted successfully');
        fetchRecentLinks();
      } else {
        const data = await res.json();
        message.error(data.detail || 'Failed to delete link');
      }
    } catch (error) {
      console.error('Failed to delete link', error);
      message.error('An error occurred while deleting');
    }
  };

  const showQrCode = (shortCode: string) => {
    setCurrentQrUrl(`/api/qr/${shortCode}`);
    setQrModalVisible(true);
  };

  const renderLinkCard = (record: ShortenedURL) => (
    <div key={record.id} className="link-card">
      <div className="link-card-main">
        <div className="link-card-urls">
          <div className="link-card-short">
            <Link2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <a href={getShortUrl(record)} target="_blank" rel="noopener noreferrer" className="short-url-link">
              {record.short_code}
            </a>
            <ExternalLink size={12} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
          </div>
          <div className="link-card-original">
            {record.original_url}
          </div>
        </div>
        <div className="link-card-actions">
          <button className="icon-btn" onClick={() => handleCopy(getShortUrl(record))} title="Copy URL">
            <Copy size={15} />
          </button>
          <button className="icon-btn" onClick={() => showQrCode(record.short_code)} title="QR Code">
            <QrCode size={15} />
          </button>
          <button className="icon-btn" onClick={() => showStats(record.short_code)} title="Analytics">
            <BarChart2 size={15} />
          </button>
          <Popconfirm
            title="Delete this link?"
            description="Are you sure you want to delete this link and its analytics?"
            onConfirm={() => handleDelete(record.short_code)}
            okText="Yes"
            cancelText="No"
            placement="topRight"
          >
            <button className="icon-btn icon-btn-danger" title="Delete">
              <Trash2 size={15} />
            </button>
          </Popconfirm>
        </div>
      </div>
      <div className="link-card-meta">
        <span className="meta-pill">
          <MousePointerClick size={12} />
          {record.click_count}{record.max_clicks ? ` / ${record.max_clicks}` : ''} clicks
        </span>
        <span className="meta-pill">
          <Calendar size={12} />
          {new Date(record.created_at).toLocaleDateString()}
        </span>
        {record.tag && (
          <span className="meta-pill meta-pill-tag">
            <TagIcon size={12} />
            {record.tag}
          </span>
        )}
        {record.expires_at && (
          <span className="meta-pill meta-pill-expire">
            Expires {new Date(record.expires_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#8b5cf6',
          colorBgBase: '#030014',
          colorBgContainer: '#0f0a2a',
          colorBgElevated: '#0f0a2a',
          colorTextBase: '#f1f0f7',
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          colorBorder: 'rgba(139, 92, 246, 0.15)',
        },
        components: {

          Modal: {
            contentBg: '#0f0a2a',
            headerBg: 'transparent',
          },
          Drawer: {
            colorBgElevated: '#0f0a2a',
          },
          Input: {
            colorBgContainer: 'rgba(139, 92, 246, 0.06)',
            colorBorder: 'rgba(139, 92, 246, 0.15)',
            activeBorderColor: '#8b5cf6',
            hoverBorderColor: '#a78bfa',
          },
          InputNumber: {
            colorBgContainer: 'rgba(139, 92, 246, 0.06)',
            colorBorder: 'rgba(139, 92, 246, 0.15)',
          },
          Button: {
            colorPrimary: '#8b5cf6',
            colorPrimaryHover: '#7c3aed',
            colorPrimaryActive: '#6d28d9',
          },
          Tag: {
            colorBorder: 'rgba(139, 92, 246, 0.3)',
          }
        }
      }}
    >
      <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <div className="bg-orbs">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
          <div className="orb orb-4"></div>
      </div>

        {/* ━━━ HERO SECTION ━━━ */}
      <Content className="container">
        <section className="hero">
          {/* Animated particle grid */}
          <div className="hero-particles">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="particle" />
            ))}
          </div>

          {/* Badge */}
          <div className="hero-badge">Open Source • Self-Hostable • Analytics Included</div>

          {/* Logo */}
          <div className="hero-brand">
            <div className="hero-logo-icon">
              <img src="/favicon.svg" alt="tinylnk logo" className="hero-logo-image" />
            </div>
          </div>

          {/* Feature pills */}
          <div className="hero-features">
            <div className="feature-pill">
              <div className="feature-pill-icon purple">
                <Zap size={18} />
              </div>
              <div className="feature-pill-text">
                <span className="feature-pill-label">Lightning Fast</span>
                <span className="feature-pill-desc">Instant redirects</span>
              </div>
            </div>
            <div className="feature-pill">
              <div className="feature-pill-icon pink">
                <ChartNoAxesCombined size={18} />
              </div>
              <div className="feature-pill-text">
                <span className="feature-pill-label">Deep Analytics</span>
                <span className="feature-pill-desc">Clicks, browsers & more</span>
              </div>
            </div>
            <div className="feature-pill">
              <div className="feature-pill-icon cyan">
                <Shield size={18} />
              </div>
              <div className="feature-pill-text">
                <span className="feature-pill-label">Secure & Reliable</span>
                <span className="feature-pill-desc">Built-in link safety</span>
              </div>
            </div>
          </div>

          {/* Trust stats */}
          <div className="hero-trust">
            <div className="trust-stat">
              <div className="trust-stat-value">{recentLinks.length > 0 ? `${recentLinks.length}+` : '—'}</div>
              <div className="trust-stat-label">Links Created</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value">
                {recentLinks.length > 0
                  ? recentLinks.reduce((sum, l) => sum + l.click_count, 0).toLocaleString()
                  : '—'}
              </div>
              <div className="trust-stat-label">Total Clicks</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value">OSS</div>
              <div className="trust-stat-label">Open Source</div>
            </div>
          </div>

          {/* Scroll indicator */}
          <button type="button" className="scroll-indicator" onClick={scrollToShortenForm}>
            <span>Start shortening</span>
            <ChevronDown size={18} />
          </button>
        </section>

        <section id="shorten-form">
          <BrowserCard label="Shorten a link" className="shorten-card">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              <div style={{ marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Paste your long URL</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Form.Item
                  name="url"
                  rules={[
                    { required: true, message: 'Please input a URL!' },
                    { validator: validateUrlInput },
                  ]}
                  style={{ flex: 1, margin: 0 }}
                >
                  <Input
                    size="large"
                    placeholder="https://example.com/your-very-long-url-goes-here"
                    prefix={<Scissors size={18} style={{ color: 'var(--text-secondary)' }}/>}
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" size="large" loading={loading} className="gradient-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Shorten
                </Button>
              </div>

              <div style={{ marginBottom: '16px', marginTop: '8px' }}>
                <button type="button" onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
                </button>
              </div>

              <div style={{ display: showAdvanced ? 'flex' : 'none', gap: '16px', flexWrap: 'wrap' }}>
                <Form.Item
                  name="custom_alias"
                  label={<span style={{ color: 'var(--text-secondary)' }}>Custom Alias (optional)</span>}
                  style={{ flex: 1, minWidth: '200px' }}
                >
                  <Input placeholder="my-custom-link" />
                </Form.Item>
                <Form.Item
                  name="expires_in_hours"
                  label={<span style={{ color: 'var(--text-secondary)' }}>Expires in (hours, optional)</span>}
                  style={{ flex: 1, minWidth: '200px' }}
                >
                  <InputNumber style={{ width: '100%' }} placeholder="e.g. 24" min={1} max={8760} />
                </Form.Item>
                <Form.Item
                  name="max_clicks"
                  label={<span style={{ color: 'var(--text-secondary)' }}>Max Clicks (optional)</span>}
                  style={{ flex: 1, minWidth: '200px' }}
                >
                  <InputNumber style={{ width: '100%' }} placeholder="e.g. 100" min={1} />
                </Form.Item>
                <Form.Item
                  name="tag"
                  label={<span style={{ color: 'var(--text-secondary)' }}>Tag / Category (optional)</span>}
                  style={{ flex: 1, minWidth: '200px' }}
                >
                  <Input placeholder="e.g. marketing" />
                </Form.Item>
              </div>
            </Form>

            {result && (
              <BrowserCard label="Short link created" className="result-card result-card-success">
                <div style={{ color: 'var(--success)', marginBottom: '8px', fontWeight: 600, fontSize: '15px' }}>✨ URL Shortened Successfully!</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Input value={getShortUrl(result)} readOnly style={{ flex: 1, color: 'var(--accent)' }} />
                  <Button icon={<Copy size={16} />} onClick={() => handleCopy(getShortUrl(result))}>Copy</Button>
                  <Button icon={<QrCode size={16} />} onClick={() => showQrCode(result.short_code)}>QR</Button>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {result.original_url}
                </div>
              </BrowserCard>
            )}
          </BrowserCard>
        </section>

        <section style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <Title level={4} style={{ margin: 0 }} className="section-title">Recent Links</Title>
            <Button type="text" icon={<RotateCw size={16} />} onClick={fetchRecentLinks} loading={tableLoading}>Refresh</Button>
          </div>
          <div className="links-list">
            {tableLoading ? (
              <div style={{ textAlign: 'center', padding: '48px' }}><Spin /></div>
            ) : recentLinks.length === 0 ? (
              <div className="empty-state">
                <Link2 size={32} style={{ color: 'var(--text-secondary)', opacity: 0.4, marginBottom: '12px' }} />
                <div>No links shortened yet.</div>
                <div style={{ fontSize: '13px', marginTop: '4px' }}>Paste a URL above to get started!</div>
              </div>
            ) : (
              recentLinks.map(renderLinkCard)
            )}
          </div>
        </section>

      </Content>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={20} /> <span style={{ color: 'var(--text-primary)'}}>Link Analytics</span>
          </div>
        }
        open={statsModalVisible}
        onCancel={() => setStatsModalVisible(false)}
        footer={null}
        width={600}
      >
        {statsLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
        ) : currentStats ? (
          <div>
            <BrowserCard label="Link summary" className="stats-summary" bodyClassName="stats-summary-body">
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)'}}>Short URL</div>
              <div style={{ color: 'var(--accent)', fontSize: '18px', fontWeight: 600, wordBreak: 'break-all' }}>{currentHost}/{currentStats.short_code}</div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px'}}>Original URL</div>
              <div style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>{currentStats.original_url}</div>

              <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)'}}>Total Clicks</div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {currentStats.total_clicks} {currentStats.max_clicks ? <span style={{fontSize: '16px', color: 'var(--text-secondary)'}}>/ {currentStats.max_clicks}</span> : ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)'}}>Created</div>
                  <div>{new Date(currentStats.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </BrowserCard>

            {currentStats.clicks_by_date && currentStats.clicks_by_date.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <Title level={5} style={{ color: 'var(--text-primary)' }}>Clicks Over Time</Title>
                <BrowserCard label="Clicks over time" className="stat-chart-bg" bodyClassName="stat-chart-body" >
                  <div style={{ height: 200, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={currentStats.clicks_by_date}>
                        <defs>
                          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#8b5cf6" />
                            <stop offset="100%" stopColor="#ec4899" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(139,92,246,0.1)" />
                        <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <RechartsTooltip
                         contentStyle={{ background: '#0f0a2a', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}
                         itemStyle={{ color: '#8b5cf6' }}
                        />
                        <Line type="monotone" dataKey="value" name="Clicks" stroke="url(#lineGradient)" strokeWidth={2} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6, fill: '#ec4899' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </BrowserCard>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {currentStats.browser_stats && currentStats.browser_stats.length > 0 && (
                <div style={{ flex: '1 1 200px' }}>
                  <Title level={5} style={{ color: 'var(--text-primary)' }}>Browsers</Title>
                  <BrowserCard label="Browsers" className="stat-chart-bg" bodyClassName="stat-chart-body">
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={currentStats.browser_stats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2}>
                            {currentStats.browser_stats.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ background: '#0f0a2a', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-primary)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </BrowserCard>
                </div>
              )}
              {currentStats.os_stats && currentStats.os_stats.length > 0 && (
                <div style={{ flex: '1 1 200px' }}>
                  <Title level={5} style={{ color: 'var(--text-primary)' }}>Operating Systems</Title>
                  <BrowserCard label="Operating systems" className="stat-chart-bg" bodyClassName="stat-chart-body">
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={currentStats.os_stats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2}>
                            {currentStats.os_stats.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip contentStyle={{ background: '#0f0a2a', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-primary)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </BrowserCard>
                </div>
              )}
            </div>

            <Title level={5} style={{ color: 'var(--text-primary)', marginTop: '24px' }}>Recent Click Activity</Title>
            {currentStats.recent_clicks && currentStats.recent_clicks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {currentStats.recent_clicks.map((click, i) => (
                  <div key={i} className="click-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(click.clicked_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Globe size={14} style={{ color: 'var(--text-secondary)' }} />
                      <span style={{ color: 'var(--text-secondary)' }}>Referrer: </span>
                      <span style={{ color: 'var(--text-primary)' }}>{click.referrer || 'Direct'}</span>
                    </div>
                    <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                      <Monitor size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {click.user_agent}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', padding: '16px 0' }}>No recent click data available.</div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} /> <span style={{ color: 'var(--text-primary)'}}>QR Code</span>
          </div>
        }
        open={qrModalVisible}
        onCancel={() => setQrModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setQrModalVisible(false)}>
            Close
          </Button>,
          <Button key="download" type="primary" onClick={() => {
            if (currentQrUrl) {
              const a = document.createElement('a');
              a.href = currentQrUrl;
              a.download = 'qrcode.png';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }
          }}>
            Download
          </Button>
        ]}
        width={400}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          {currentQrUrl && (
            <img src={currentQrUrl} alt="QR Code" style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }} />
          )}
        </div>
      </Modal>
    </Layout>
    </ConfigProvider>
  );
}

export default App;