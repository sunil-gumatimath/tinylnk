import { useState, useEffect } from 'react';
import { Layout, Typography, Form, Input, InputNumber, Button, Table, message, Modal, Space, Popconfirm, Tag } from 'antd';
import { Scissors, Copy, RotateCw, BarChart2, Trash2, QrCode } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const { Content } = Layout;
const { Title } = Typography;

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

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

  const columns = [
    {
      title: 'Short URL',
      dataIndex: 'short_code',
      key: 'short_code',
      render: (_text: string, record: ShortenedURL) => (
        <a href={getShortUrl(record)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          {record.short_code}
        </a>
      ),
    },
    {
      title: 'Original URL',
      dataIndex: 'original_url',
      key: 'original_url',
      ellipsis: true,
      render: (text: string) => (
        <div style={{ maxWidth: 200, WebkitLineClamp: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {text}
        </div>
      )
    },
    {
      title: 'Tag',
      dataIndex: 'tag',
      key: 'tag',
      width: 100,
      render: (tag: string | null) => tag ? <Tag color="blue">{tag}</Tag> : '-',
    },
    {
      title: 'Clicks',
      key: 'clicks',
      width: 100,
      render: (_value: unknown, record: ShortenedURL) => (
        <span>{record.click_count} {record.max_clicks ? `/ ${record.max_clicks}` : ''}</span>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_value: unknown, record: ShortenedURL) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<Copy size={16} />}
            onClick={() => handleCopy(getShortUrl(record))}
            title="Copy URL"
          />
          <Button
            type="text"
            icon={<QrCode size={16} />}
            onClick={() => showQrCode(record.short_code)}
            title="View QR Code"
          />
          <Button
            type="text"
            icon={<BarChart2 size={16} />}
            onClick={() => showStats(record.short_code)}
            title="View Stats"
          />
          <Popconfirm
            title="Delete this link?"
            description="Are you sure you want to delete this link and its analytics?"
            onConfirm={() => handleDelete(record.short_code)}
            okText="Yes"
            cancelText="No"
            placement="topRight"
          >
            <Button
              type="text"
              danger
              icon={<Trash2 size={16} />}
              title="Delete Link"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <div className="bg-orbs">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
      </div>

      <Content className="container">
        <div className="header">
          <div className="logo">
            <Scissors className="logo-icon" />
            <h1>tinylnk</h1>
          </div>
          <p className="tagline">Lightning-fast URL shortening with analytics</p>
        </div>

        <section className="shorten-card glass">
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
              <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                Shorten
              </Button>
            </div>

            <div style={{ marginBottom: '16px', marginTop: '8px' }}>
              <button type="button" onClick={(e) => { e.preventDefault(); setShowAdvanced(!showAdvanced); }} style={{ background: 'transparent', border: 'none', padding: 0, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '14px' }}>
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
            <div className="glass" style={{ marginTop: '24px', padding: '16px', borderRadius: '8px', border: '1px solid var(--success)', background: 'rgba(16, 185, 129, 0.1)' }}>
              <div style={{ color: 'var(--success)', marginBottom: '8px', fontWeight: 600 }}>URL Shortened Successfully!</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input value={getShortUrl(result)} readOnly style={{ flex: 1, color: 'var(--accent)' }} />
                <Button icon={<Copy size={16} />} onClick={() => handleCopy(getShortUrl(result))}>Copy</Button>
                <Button icon={<QrCode size={16} />} onClick={() => showQrCode(result.short_code)}>QR</Button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.original_url}
              </div>
            </div>
          )}
        </section>

        <section style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <Title level={4} style={{ margin: 0, color: 'var(--text-primary)' }}>Recent Links</Title>
            <Button type="text" icon={<RotateCw size={16} />} onClick={fetchRecentLinks} loading={tableLoading}>Refresh</Button>
          </div>
          <div className="glass" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            <Table 
              dataSource={recentLinks} 
              columns={columns} 
              rowKey="id" 
              pagination={false}
              loading={tableLoading}
              locale={{ emptyText: <div style={{ color: 'var(--text-secondary)', padding: '24px' }}>No links shortened yet. Paste a URL above to get started!</div> }}
            />
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
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
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
            </div>

            {currentStats.clicks_by_date && currentStats.clicks_by_date.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <Title level={5} style={{ color: 'var(--text-primary)' }}>Clicks Over Time</Title>
                <div style={{ height: 200, width: '100%', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={currentStats.clicks_by_date}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{ background: '#1f2937', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        itemStyle={{ color: 'var(--accent)' }}
                      />
                      <Line type="monotone" dataKey="value" name="Clicks" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: 'var(--accent)' }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {currentStats.browser_stats && currentStats.browser_stats.length > 0 && (
                <div style={{ flex: '1 1 200px' }}>
                  <Title level={5} style={{ color: 'var(--text-primary)' }}>Browsers</Title>
                  <div style={{ height: 200, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={currentStats.browser_stats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2}>
                          {currentStats.browser_stats.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-primary)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {currentStats.os_stats && currentStats.os_stats.length > 0 && (
                <div style={{ flex: '1 1 200px' }}>
                  <Title level={5} style={{ color: 'var(--text-primary)' }}>Operating Systems</Title>
                  <div style={{ height: 200, background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '8px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={currentStats.os_stats} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={60} paddingAngle={2}>
                          {currentStats.os_stats.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />)}
                        </Pie>
                        <RechartsTooltip contentStyle={{ background: '#1f2937', border: 'none', borderRadius: '8px' }} itemStyle={{ color: 'var(--text-primary)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            <Title level={5} style={{ color: 'var(--text-primary)', marginTop: '24px' }}>Recent Click Activity</Title>
            {currentStats.recent_clicks && currentStats.recent_clicks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {currentStats.recent_clicks.map((click, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(click.clicked_at).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Referrer: </span>
                      {click.referrer || 'Direct'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {click.user_agent}
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
  );
}

export default App;
