import { useEffect, useState } from 'react';
import { Button, Form, Layout, Spin, Typography, message } from 'antd';
import { RefreshCw } from 'lucide-react';
import { Hero } from './components/Hero';
import { LinkCard } from './components/LinkCard';
import { QrModal } from './components/QrModal';
import { ShortenerForm } from './components/ShortenerForm';
import { StatsModal } from './components/StatsModal';
import type { ShortenFormValues, ShortenedURL, UrlStats } from './types';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

function App() {
  const [form] = Form.useForm<ShortenFormValues>();
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recentLinks, setRecentLinks] = useState<ShortenedURL[]>([]);
  const [result, setResult] = useState<ShortenedURL | null>(null);
  const [currentStats, setCurrentStats] = useState<UrlStats | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);

  const currentHost = window.location.origin;

  const getShortUrl = (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) =>
    record.short_url || `${currentHost}/${record.short_code}`;

  const fetchRecentLinks = async () => {
    setTableLoading(true);
    try {
      const response = await fetch('/api/recent');
      if (!response.ok) {
        message.error('Could not load recent links.');
        return;
      }

      const data = await response.json();
      setRecentLinks(data);
    } catch (error) {
      console.error('Failed to fetch recent links', error);
      message.error('Could not load recent links.');
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
      return Promise.reject(new Error('Must be a valid URL or domain.'));
    }
  };

  const scrollToShortenForm = () => {
    document.getElementById('shorten-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Copied to clipboard.');
    } catch {
      message.error('Could not copy. Please copy manually.');
    }
  };

  const onFinish = async (values: ShortenFormValues) => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: values.url,
          custom_alias: values.custom_alias?.trim() || null,
          expires_in_hours: values.expires_in_hours ? Number(values.expires_in_hours) : null,
          max_clicks: values.max_clicks ? Number(values.max_clicks) : null,
          tag: values.tag?.trim() || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Failed to shorten URL.');
      }

      setResult(data);
      form.resetFields();
      message.success('URL shortened successfully.');
      await fetchRecentLinks();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const showStats = async (shortCode: string) => {
    setStatsModalVisible(true);
    setStatsLoading(true);
    setCurrentStats(null);

    try {
      const response = await fetch(`/api/stats/${shortCode}`);
      if (!response.ok) {
        message.error('Failed to fetch stats.');
        setStatsModalVisible(false);
        return;
      }

      const data = await response.json();
      setCurrentStats(data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
      message.error('An error occurred while loading stats.');
      setStatsModalVisible(false);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleDelete = async (shortCode: string) => {
    try {
      const response = await fetch(`/api/urls/${shortCode}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        message.error(data.detail || 'Failed to delete link.');
        return;
      }

      message.success('Link deleted successfully.');
      await fetchRecentLinks();
    } catch (error) {
      console.error('Failed to delete link', error);
      message.error('An error occurred while deleting.');
    }
  };

  const showQrCode = (shortCode: string) => {
    setCurrentQrUrl(`/api/qr/${shortCode}`);
    setQrModalVisible(true);
  };

  return (
    <Layout className="app-shell">
      <div className="ambient-backdrop">
        <div className="grid-overlay" />
      </div>

      <Content className="page-shell">
        <Hero recentLinks={recentLinks} onPrimaryAction={scrollToShortenForm} />

        <ShortenerForm
          form={form}
          loading={loading}
          showAdvanced={showAdvanced}
          result={result}
          onSubmit={onFinish}
          onToggleAdvanced={() => setShowAdvanced((value) => !value)}
          onCopy={handleCopy}
          onShowQr={showQrCode}
          getShortUrl={getShortUrl}
          validateUrlInput={validateUrlInput}
        />

        <section className="links-section">
          <div className="section-heading section-heading-row">
            <div>
              <span className="section-kicker">Manage links</span>
              <Title level={2}>Recently shortened URLs</Title>
              <Paragraph>
                View, manage, and check analytics for your generated short links.
              </Paragraph>
            </div>
            <Button onClick={fetchRecentLinks} loading={tableLoading} icon={<RefreshCw size={16} />}>
              Refresh
            </Button>
          </div>

          {tableLoading ? (
            <div className="empty-state panel-surface">
              <Spin />
              <span>Loading recent links...</span>
            </div>
          ) : recentLinks.length === 0 ? (
            <div className="empty-state panel-surface">
              <h3>No links yet</h3>
              <p>Create your first short link above and the workspace will fill in here.</p>
            </div>
          ) : (
            <div className="links-grid">
              {recentLinks.map((record) => (
                <LinkCard
                  key={record.id}
                  record={record}
                  getShortUrl={getShortUrl}
                  onCopy={handleCopy}
                  onShowQr={showQrCode}
                  onShowStats={showStats}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </Content>

      <StatsModal
        open={statsModalVisible}
        loading={statsLoading}
        currentHost={currentHost}
        stats={currentStats}
        onClose={() => setStatsModalVisible(false)}
      />

      <QrModal open={qrModalVisible} currentQrUrl={currentQrUrl} onClose={() => setQrModalVisible(false)} />
    </Layout>
  );
}

export default App;
