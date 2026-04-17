import { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, Layout, Select, Spin, Typography, message } from 'antd';
import { FolderOpen, RefreshCw, Search, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from './ThemeProvider';
import { Hero } from './components/Hero';
import { LinkCard } from './components/LinkCard';
import { EditModal } from './components/EditModal';
import { QrModal } from './components/QrModal';
import { ShortenerForm } from './components/ShortenerForm';
import { StatsModal } from './components/StatsModal';
import type { EditFormValues } from './components/EditModal';
import type { ShortenFormValues, ShortenedURL, UrlStats } from './types';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  }),
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
};

function App() {
  const [form] = Form.useForm<ShortenFormValues>();
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [recentLinks, setRecentLinks] = useState<ShortenedURL[]>([]);
  const [result, setResult] = useState<ShortenedURL | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [currentShortUrl, setCurrentShortUrl] = useState<string>('');
  const [currentStats, setCurrentStats] = useState<UrlStats | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null);
  const { isDark, toggleTheme } = useTheme();

  // New state for features
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ShortenedURL | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [statsDateRange, setStatsDateRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });

  const currentHost = window.location.origin;

  /** Build headers object for admin-protected requests. */
  const authHeaders = (key: string | null = adminKey): Record<string, string> => {
    return key ? { 'X-Admin-Key': key } : {};
  };

  const getShortUrl = (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) =>
    record.short_url || `${currentHost}/${record.short_code}`;

  const promptForAdminKey = (reason: 'dashboard' | 'stats' | 'delete' | 'edit'): string | null => {
    const promptMessage = {
      dashboard: 'Enter admin key to unlock link management:',
      stats: 'Enter admin key to view analytics:',
      delete: 'Enter admin key to delete links:',
      edit: 'Enter admin key to edit links:',
    }[reason];

    const key = window.prompt(promptMessage)?.trim() || '';
    if (!key) {
      return null;
    }

    setAdminKey(key);
    return key;
  };

  const clearAdminSession = () => {
    setAdminKey(null);
    setRecentLinks([]);
    setAvailableTags([]);
  };

  const fetchTags = async (key: string) => {
    try {
      const response = await fetch('/api/tags', { headers: authHeaders(key) });
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data);
      }
    } catch {
      // Non-critical, silently fail
    }
  };

  const fetchRecentLinks = async (providedKey?: string, search?: string, tag?: string | null) => {
    const key = providedKey ?? adminKey;
    if (!key) {
      return;
    }

    setTableLoading(true);
    try {
      const params = new URLSearchParams();
      const searchTerm = search ?? searchQuery;
      const tagFilter = tag === undefined ? filterTag : tag;
      if (searchTerm) params.set('search', searchTerm);
      if (tagFilter) params.set('tag', tagFilter);

      const url = `/api/recent${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, { headers: authHeaders(key) });
      if (response.status === 403) {
        clearAdminSession();
        message.error('Invalid admin key. Please try again.');
        return;
      }

      if (!response.ok) {
        message.error('Could not load recent links.');
        return;
      }

      const data = await response.json();
      setAdminKey(key);
      setRecentLinks(data);

      // Also fetch tags
      await fetchTags(key);
    } catch (error) {
      console.error('Failed to fetch recent links', error);
      message.error('Could not load recent links.');
    } finally {
      setTableLoading(false);
    }
  };

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

  const handleShare = async (shortUrl: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'tinylnk', url: shortUrl });
      } catch {
        // User cancelled share
      }
    } else {
      await handleCopy(shortUrl);
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
      if (adminKey) {
        await fetchRecentLinks(adminKey);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const showStats = async (shortCode: string, shortUrl: string) => {
    const key = adminKey ?? promptForAdminKey('stats');
    if (!key) {
      return;
    }

    setCurrentShortUrl(shortUrl);
    setStatsModalVisible(true);
    setStatsLoading(true);
    setCurrentStats(null);
    setStatsDateRange({ start: null, end: null });

    try {
      const response = await fetch(`/api/stats/${shortCode}`, { headers: authHeaders(key) });
      if (response.status === 403) {
        clearAdminSession();
        message.error('Invalid admin key. Please try again.');
        setStatsModalVisible(false);
        return;
      }

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

  const handleStatsDateChange = async (startDate: string | null, endDate: string | null) => {
    if (!currentStats || !adminKey) return;

    setStatsDateRange({ start: startDate, end: endDate });
    setStatsLoading(true);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const url = `/api/stats/${currentStats.short_code}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, { headers: authHeaders() });
      if (response.ok) {
        const data = await response.json();
        setCurrentStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch filtered stats', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleDelete = async (shortCode: string) => {
    try {
      const key = adminKey ?? promptForAdminKey('delete');
      if (!key) return;

      const response = await fetch(`/api/urls/${shortCode}`, {
        method: 'DELETE',
        headers: authHeaders(key),
      });

      if (response.status === 403) {
        clearAdminSession();
        message.error('Invalid admin key. Please try again.');
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        message.error(data.detail || 'Failed to delete link.');
        return;
      }

      message.success('Link deleted successfully.');
      await fetchRecentLinks(key);
    } catch (error) {
      console.error('Failed to delete link', error);
      message.error('An error occurred while deleting.');
    }
  };

  const handleEdit = (record: ShortenedURL) => {
    const key = adminKey ?? promptForAdminKey('edit');
    if (!key) return;
    setEditingRecord(record);
    setEditModalVisible(true);
  };

  const handleEditSave = async (shortCode: string, data: EditFormValues) => {
    if (!adminKey) return;
    setEditLoading(true);

    try {
      const response = await fetch(`/api/urls/${shortCode}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          original_url: data.original_url || null,
          custom_alias: data.custom_alias || null,
          tag: data.tag || null,
          expires_in_hours: data.expires_in_hours,
          max_clicks: data.max_clicks,
        }),
      });

      if (response.status === 403) {
        clearAdminSession();
        message.error('Invalid admin key.');
        setEditModalVisible(false);
        return;
      }

      const result = await response.json();
      if (!response.ok) {
        message.error(result.detail || 'Failed to update link.');
        return;
      }

      message.success('Link updated successfully.');
      setEditModalVisible(false);
      setEditingRecord(null);
      await fetchRecentLinks(adminKey);
    } catch (error) {
      console.error('Failed to update', error);
      message.error('An error occurred while updating.');
    } finally {
      setEditLoading(false);
    }
  };

  const unlockDashboard = async () => {
    const key = promptForAdminKey('dashboard');
    if (!key) {
      return;
    }

    await fetchRecentLinks(key);
  };

  const showQrCode = (shortCode: string) => {
    setCurrentQrUrl(`/api/qr/${shortCode}`);
    setQrModalVisible(true);
  };

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ctrl/Cmd+K → focus URL input
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const urlInput = document.querySelector<HTMLInputElement>('#shorten-form input');
      if (urlInput) {
        urlInput.focus();
        scrollToShortenForm();
      }
    }
    // Escape → close modals
    if (e.key === 'Escape') {
      setStatsModalVisible(false);
      setQrModalVisible(false);
      setEditModalVisible(false);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Debounced search
  useEffect(() => {
    if (!adminKey) return;
    const timer = setTimeout(() => {
      fetchRecentLinks(adminKey, searchQuery, filterTag);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filterTag]);

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
            <Button onClick={adminKey ? () => fetchRecentLinks() : unlockDashboard} loading={tableLoading} icon={<RefreshCw size={16} />}>
              {adminKey ? 'Refresh' : 'Unlock'}
            </Button>
          </div>

          {adminKey ? (
            <motion.div
              className="search-toolbar"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.3 }}
            >
              <Input
                prefix={<Search size={16} color="var(--text-muted)" />}
                placeholder="Search by URL, alias, or short code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                allowClear
                className="search-input"
              />
              <Select
                placeholder="All tags"
                value={filterTag}
                onChange={(val) => setFilterTag(val)}
                allowClear
                style={{ minWidth: 160 }}
                options={availableTags.map((t) => ({ label: t, value: t }))}
              />
            </motion.div>
          ) : null}

          {tableLoading ? (
            <div className="empty-state panel-surface">
              <Spin />
              <span>Loading active links...</span>
            </div>
          ) : !adminKey ? (
            <div className="empty-state panel-surface">
              <FolderOpen size={44} strokeWidth={1} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
              <h3>Dashboard locked</h3>
              <p>Enter the admin key to view recent links, analytics, and destructive actions for this tinylnk instance.</p>
              <Button type="primary" onClick={unlockDashboard}>
                Unlock dashboard
              </Button>
            </div>
          ) : recentLinks.length === 0 ? (
            <div className="empty-state panel-surface">
              <FolderOpen size={44} strokeWidth={1} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
              <h3>{searchQuery || filterTag ? 'No matches found' : 'No links yet'}</h3>
              <p>
                {searchQuery || filterTag
                  ? 'Try adjusting your search or clearing the tag filter.'
                  : 'Create your first short link above to start building a searchable, trackable link library.'}
              </p>
            </div>
          ) : (
            <div className="links-grid">
              <AnimatePresence mode="popLayout">
                {recentLinks.map((record, i) => (
                  <motion.div
                    key={record.id}
                    variants={cardVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    custom={i}
                    layout
                  >
                    <LinkCard
                      record={record}
                      getShortUrl={getShortUrl}
                      onCopy={handleCopy}
                      onShowQr={showQrCode}
                      onShowStats={showStats}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onShare={handleShare}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
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
        onDateRangeChange={handleStatsDateChange}
        adminKey={adminKey}
      />

      <EditModal
        open={editModalVisible}
        loading={editLoading}
        record={editingRecord}
        onSave={handleEditSave}
        onClose={() => {
          setEditModalVisible(false);
          setEditingRecord(null);
        }}
      />

      <QrModal open={qrModalVisible} currentQrUrl={currentQrUrl} onClose={() => setQrModalVisible(false)} />
    </Layout>
  );
}

export default App;
