import { useState, useEffect } from 'react';
import { Layout, Typography, Form, Input, InputNumber, Button, Table, message, Modal, Space } from 'antd';
import { Scissors, Copy, RotateCw, BarChart2 } from 'lucide-react';

const { Content, Footer } = Layout;
const { Title } = Typography;

interface ShortenedURL {
  id: number;
  original_url: string;
  short_code: string;
  short_url: string;
  created_at: string;
  expires_at: string | null;
  click_count: number;
}

interface ClickEvent {
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
}

interface UrlStats {
  original_url: string;
  short_code: string;
  created_at: string;
  expires_at: string | null;
  total_clicks: number;
  recent_clicks: ClickEvent[];
}

interface ShortenFormValues {
  url: string;
  custom_alias?: string;
  expires_in_hours?: number;
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

  const fetchRecentLinks = async () => {
    setTableLoading(true);
    try {
      const res = await fetch('/api/recent');
      if (res.ok) {
        const data = await res.json();
        setRecentLinks(data);
      }
    } catch (error) {
      console.error("Failed to fetch recent links", error);
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
          custom_alias: values.custom_alias || undefined,
          expires_in_hours: values.expires_in_hours || undefined,
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('Copied to clipboard!');
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

  const columns = [
    {
      title: 'Short URL',
      dataIndex: 'short_code',
      key: 'short_code',
      render: (text: string) => (
        <a href={`${currentHost}/${text}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          {text}
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
      title: 'Clicks',
      dataIndex: 'click_count',
      key: 'click_count',
      width: 80,
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
            onClick={() => handleCopy(`${currentHost}/${record.short_code}`)}
          />
          <Button 
            type="text" 
            icon={<BarChart2 size={16} />} 
            onClick={() => showStats(record.short_code)}
          />
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
            <Form.Item
              name="url"
              label={<span style={{ color: 'var(--text-secondary)' }}>Paste your long URL</span>}
              rules={[
                { required: true, message: 'Please input a URL!' },
                { validator: validateUrlInput },
              ]}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input 
                  size="large" 
                  placeholder="https://example.com/your-very-long-url-goes-here" 
                  prefix={<Scissors size={18} style={{ color: 'var(--text-secondary)' }}/>} 
                  style={{ flex: 1 }}
                />
                <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Shorten
                </Button>
              </div>
            </Form.Item>

            <div style={{ marginBottom: '16px' }}>
              <Button type="link" onClick={() => setShowAdvanced(!showAdvanced)} style={{ padding: 0, color: 'var(--text-secondary)' }}>
                {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
              </Button>
            </div>

            {showAdvanced && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
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
              </div>
            )}
          </Form>

          {result && (
            <div className="glass" style={{ marginTop: '24px', padding: '16px', borderRadius: '8px', border: '1px solid var(--success)', background: 'rgba(16, 185, 129, 0.1)' }}>
              <div style={{ color: 'var(--success)', marginBottom: '8px', fontWeight: 600 }}>URL Shortened Successfully!</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input value={`${currentHost}/${result.short_code}`} readOnly style={{ flex: 1, color: 'var(--accent)' }} />
                <Button icon={<Copy size={16} />} onClick={() => handleCopy(`${currentHost}/${result.short_code}`)}>Copy</Button>
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
      
      <Footer className="footer" style={{ background: 'transparent' }}>
        <p>Built with <span className="heart">♥</span> using FastAPI, React & Ant Design</p>
      </Footer>

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
                  <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{currentStats.total_clicks}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)'}}>Created</div>
                  <div>{new Date(currentStats.created_at).toLocaleDateString()}</div>
                </div>
              </div>
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
    </Layout>
  );
}

export default App;
