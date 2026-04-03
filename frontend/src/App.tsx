import { useEffect, useState } from 'react';
import { Button, Form, Layout, Spin, Typography, message } from 'antd';
import { RefreshCw, FolderOpen, Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
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
  const [currentShortUrl, setCurrentShortUrl] = useState<string>('');
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);
  const { isDark, toggleTheme } = useTheme();

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
      const parsed = new URL(normalized);
      if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') {
        throw new Error('Invalid domain');
      }
      return Promise.resolve();
    } catch {
      return Promise.reject(new Error('Must be a valid URL with a domain.'));
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

  const showStats = async (shortCode: string, shortUrl: string) => {
    setCurrentShortUrl(shortUrl);
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
      <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 100 }}>
        <Button 
          type="text" 
          onClick={toggleTheme} 
          icon={isDark ? <Sun size={20} color="var(--text)" /> : <Moon size={20} color="var(--text)" />} 
        />
      </div>
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
              <Title level={2}>Link Activity Dashboard</Title>
              <Paragraph>
                Monitor real-time engagement, copy your branded URLs for immediate sharing, or manage active campaigns.
              </Paragraph>
            </div>
            <Button onClick={fetchRecentLinks} loading={tableLoading} icon={<RefreshCw size={16} />}>
              Refresh
            </Button>
          </div>

          {tableLoading ? (
            <div className="empty-state panel-surface">
              <Spin />
              <span>Loading active links...</span>
            </div>
          ) : recentLinks.length === 0 ? (
            <div className="empty-state panel-surface">
              <FolderOpen size={44} strokeWidth={1} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
              <h3>No links yet</h3>
              <p>Create your first short link above to start building a searchable, trackable link library.</p>
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
        currentShortUrl={currentShortUrl}
        stats={currentStats}
        onClose={() => setStatsModalVisible(false)}
      />

      <QrModal open={qrModalVisible} currentQrUrl={currentQrUrl} onClose={() => setQrModalVisible(false)} />
    </Layout>
  );
}

export default App;

// TODO: Add React error boundary component

// TODO: Add toast notification system

// TODO: Add keyboard shortcuts for power users

// TODO: Add Web Vitals performance monitoring

// TODO: Add i18n support for multiple languages

// TODO: Add React.lazy code splitting for routes

// TODO: Add undo functionality for deletions

// TODO: Add React error boundary for graceful error handling

// TODO: Add keyboard shortcuts for power users

// TODO: Add Web Vitals performance monitoring

// TODO: Add i18n support for multiple languages
