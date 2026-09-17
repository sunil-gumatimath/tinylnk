import { useEffect, useRef, useState } from 'react';
import { App as AntdApp, Button, DatePicker, Modal } from 'antd';
import { BarChart2, Calendar, Download, Globe, Monitor, MousePointerClick, Target } from 'lucide-react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartColors } from '../theme';
import { errorText, readJson, saveBlob } from '../ui';
import type { UrlStats } from '../types';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface StatsModalProps {
  /** Short code (or alias) whose analytics are shown. */
  shortCode: string;
  currentShortUrl: string;
  onClose: () => void;
  /** Auth headers for the admin-protected requests (Clerk JWT). */
  getAuthHeaders: () => Promise<Record<string, string>>;
}

export default function StatsModal({ shortCode, currentShortUrl, onClose, getAuthHeaders }: StatsModalProps) {
  const { message } = AntdApp.useApp();
  const [stats, setStats] = useState<UrlStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // The controlled picker is the single source of truth for the range: charts,
  // KPIs and the CSV export all cover exactly the window shown here, and the
  // selection resets when a different link is opened (fresh component via key).
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef<AbortController | null>(null);

  const fetchStats = async (start: string | null, end: string | null, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (start) params.set('start_date', start);
      if (end) params.set('end_date', end);
      const query = params.toString();
      const response = await fetch(`/api/stats/${encodeURIComponent(shortCode)}${query ? `?${query}` : ''}`, {
        headers: await getAuthHeaders(),
        signal,
      });
      const data = await readJson<UrlStats>(response);
      if (!signal.aborted) setStats(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(errorText(err));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  // Reload analytics when range or reloadKey changes; abort in-flight request
  // when component unmounts or re-queries for another link.
  useEffect(() => {
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    fetchStats(range?.[0]?.startOf('day').toISOString() ?? null, range?.[1]?.endOf('day').toISOString() ?? null, controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortCode, range, reloadKey]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => setRange(dates && dates[0] && dates[1] ? dates : null);

  const handleExport = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (range?.[0]) params.set('start_date', range[0].startOf('day').toISOString());
      if (range?.[1]) params.set('end_date', range[1].endOf('day').toISOString());
      const query = params.toString();
      const response = await fetch(
        `/api/stats/${encodeURIComponent(stats.short_code)}/export${query ? `?${query}` : ''}`,
        { headers: await getAuthHeaders() },
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('Export is empty');
      saveBlob(blob, `tinylnk_${stats.short_code}_analytics.csv`);
    } catch {
      message.error('Could not download the CSV file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const dayjsValue = range;

  return (
    <Modal
      open
      onCancel={onClose}
      footer={null}
      width={880}
      title={
        <div className="modal-title">
          <BarChart2 size={18} />
          Link analytics
        </div>
      }
    >
      {error ? (
        <div className="modal-state">
          <p>{error}</p>
          <Button onClick={() => setReloadKey((key) => key + 1)}>Try again</Button>
        </div>
      ) : loading && !stats ? (
        <div className="modal-state" role="status">Loading analytics…</div>
      ) : !stats ? (
        <div className="modal-state">No analytics available for this link yet.</div>
      ) : (
        <div className="stats-shell">
          <section className="stats-overview">
            <div className="stats-hero panel-surface">
              <span className="panel-label">Summary</span>
              <h3>{currentShortUrl}</h3>
              <p>{stats.original_url}</p>
            </div>

            <div className="stats-kpis">
              <div className="kpi-card panel-surface">
                <MousePointerClick size={18} />
                <strong>{stats.total_clicks}</strong>
                <span>Total clicks{range ? ' (selected range)' : ''}</span>
              </div>
              <div className="kpi-card panel-surface">
                <Target size={18} />
                <strong>{stats.max_clicks ?? 'Unlimited'}</strong>
                <span>Lifetime click limit</span>
              </div>
              <div className="kpi-card panel-surface">
                <Calendar size={18} />
                <strong>{stats.created_at ? new Date(stats.created_at).toLocaleDateString() : '—'}</strong>
                <span>Created on</span>
              </div>
            </div>
          </section>

          <section className="stats-toolbar">
            <RangePicker
              value={dayjsValue}
              onChange={handleDateChange}
              style={{ borderRadius: 14 }}
              placeholder={['Start date', 'End date']}
              allowEmpty={[true, true]}
            />
            <Button
              icon={<Download size={16} />}
              onClick={handleExport}
              loading={exporting}
            >
              Export CSV
            </Button>
          </section>

          <p className="dashboard-subtitle">
            {range ? 'Showing clicks in the selected date range.' : 'Showing clicks for all time.'}
            {' '}Date filters and activity times use your local time zone; daily chart totals use UTC.
            Clicks count recorded visits, not unique visitors.
          </p>

          {loading && stats ? (
            <div className="modal-state" role="status">Updating analytics…</div>
          ) : null}

          {stats.clicks_by_date?.length ? (
            <section className="panel-surface chart-panel">
              <div className="chart-heading">
                <h4>Clicks over time</h4>
                {/* Days are bucketed by SQL date() in UTC, so label them as such
                    instead of letting them look like local days. */}
                <span>Daily trend · UTC</span>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.clicks_by_date}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="var(--chart-axis)" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--chart-axis)" />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--tooltip-bg)',
                        border: '1px solid var(--tooltip-tooltip-border, var(--tooltip-border))',
                        borderRadius: 16,
                        color: 'var(--text)',
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : (
            <div className="modal-state">No clicks recorded in this period yet.</div>
          )}

          {(stats.browser_stats?.length || stats.os_stats?.length) ? (
            <section className="stats-split">
              {stats.browser_stats?.length ? (
                <div className="panel-surface donut-panel">
                  <div className="chart-heading">
                    <h4>Browsers</h4>
                    <span>Traffic split</span>
                  </div>
                  <div className="chart-wrap compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.browser_stats} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76}>
                          {stats.browser_stats.map((_item, index) => (
                            <Cell key={index} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    {stats.browser_stats.map((item, index) => (
                      <span key={item.name} className="chart-legend-item">
                        <i style={{ background: chartColors[index % chartColors.length] }} />
                        {item.name} · {item.value}
                      </span>
                    ))}
                    </div>
                </div>
              ) : null}

              {stats.os_stats?.length ? (
                <div className="panel-surface donut-panel">
                  <div className="chart-heading">
                    <h4>Operating systems</h4>
                    <span>Traffic split</span>
                  </div>
                  <div className="chart-wrap compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.os_stats} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76}>
                          {stats.os_stats.map((_item, index) => (
                            <Cell key={index} fill={chartColors[(index + 2) % chartColors.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-legend">
                    {stats.os_stats.map((item, index) => (
                      <span key={item.name} className="chart-legend-item">
                        <i style={{ background: chartColors[(index + 2) % chartColors.length] }} />
                        {item.name} · {item.value}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {stats.referrer_stats?.length ? (
            <section className="panel-surface chart-panel">
              <div className="chart-heading">
                <h4>Referring websites</h4>
                <span>Visits with a recorded referrer</span>
              </div>
              <div className="chart-wrap compact">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats.referrer_stats} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76}>
                      {stats.referrer_stats.map((_item, index) => (
                        <Cell key={index} fill={chartColors[(index + 4) % chartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-legend">
                {stats.referrer_stats.map((item, index) => (
                  <span key={item.name} className="chart-legend-item">
                    <i style={{ background: chartColors[(index + 4) % chartColors.length] }} />
                    {item.name} · {item.value}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel-surface activity-panel">
            <div className="chart-heading">
              <h4>Recent activity</h4>
              <span>Up to 50 latest clicks in this period</span>
            </div>
            {stats.recent_clicks?.length ? (
              <div className="activity-list">
                {stats.recent_clicks.map((click, index) => (
                  <article className="activity-item" key={`${click.clicked_at}-${index}`}>
                    <div className="activity-time">{new Date(click.clicked_at).toLocaleString()}</div>
                    <div className="activity-row">
                      <Globe size={14} />
                      <span>{click.referrer || 'No referrer recorded'}</span>
                    </div>
                    <div
                      className="activity-row"
                      title={click.user_agent || undefined}
                    >
                      <Monitor size={14} />
                      {/* Parsed server-side; the raw UA string is only a
                          hover-away tooltip. */}
                      <span>
                        {[click.browser, click.os].filter(Boolean).join(' · ') ||
                          'Browser and operating system unavailable'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="modal-state">No clicks recorded in this period. Share the link or choose a different date range.</div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
