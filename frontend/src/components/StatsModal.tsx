import { useState } from 'react';
import { App as AntdApp, Button, DatePicker, Modal } from 'antd';
import { BarChart2, Calendar, Download, Globe, Monitor, MousePointerClick, Target } from 'lucide-react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { chartColors } from '../theme';
import type { UrlStats } from '../types';
import type { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface StatsModalProps {
  open: boolean;
  loading: boolean;
  currentShortUrl: string;
  stats: UrlStats | null;
  onClose: () => void;
  onDateRangeChange?: (startDate: string | null, endDate: string | null) => void;
  /** Auth headers for the CSV export (Clerk JWT). */
  getAuthHeaders: () => Promise<Record<string, string>>;
}

export function StatsModal({ open, loading, currentShortUrl, stats, onClose, onDateRangeChange, getAuthHeaders }: StatsModalProps) {
  const { message } = AntdApp.useApp();
  const [exporting, setExporting] = useState(false);
  // Kept locally so the CSV export covers exactly the range shown in the
  // charts — the endpoint supports it, the UI just has to pass it along.
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  });

  const handleDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) {
      setRange({ start: null, end: null });
      onDateRangeChange?.(null, null);
      return;
    }
    const start = dates[0].startOf('day').toISOString();
    const end = dates[1].endOf('day').toISOString();
    setRange({ start, end });
    onDateRangeChange?.(start, end);
  };

  const handleExport = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (range.start) params.set('start_date', range.start);
      if (range.end) params.set('end_date', range.end);
      const query = params.toString();
      const response = await fetch(
        `/api/stats/${stats.short_code}/export${query ? `?${query}` : ''}`,
        {
          headers: await getAuthHeaders(),
        },
      );
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tinylnk_${stats.short_code}_analytics.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      message.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
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
      {loading ? (
        <div className="modal-state">Loading analytics...</div>
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
                <span>Total clicks</span>
              </div>
              <div className="kpi-card panel-surface">
                <Target size={18} />
                <strong>{stats.max_clicks ?? 'Unlimited'}</strong>
                <span>Click limit</span>
              </div>
              <div className="kpi-card panel-surface">
                <Calendar size={18} />
                <strong>{new Date(stats.created_at).toLocaleDateString()}</strong>
                <span>Created on</span>
              </div>
            </div>
          </section>

          <section className="stats-toolbar">
            <RangePicker
              onChange={handleDateChange}
              style={{ borderRadius: 14 }}
              placeholder={['Start date', 'End date']}
            />
            <Button
              icon={<Download size={16} />}
              onClick={handleExport}
              loading={exporting}
            >
              Export CSV
            </Button>
          </section>

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
                        border: '1px solid var(--tooltip-border)',
                        borderRadius: 16,
                        color: 'var(--text)',
                      }}
                    />
                    <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

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
                </div>
              ) : null}
            </section>
          ) : null}

          {stats.referrer_stats?.length ? (
            <section className="panel-surface chart-panel">
              <div className="chart-heading">
                <h4>Referrers</h4>
                <span>Traffic sources</span>
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
            </section>
          ) : null}

          <section className="panel-surface activity-panel">
            <div className="chart-heading">
              <h4>Recent activity</h4>
              <span>Recent clicks</span>
            </div>
            {stats.recent_clicks?.length ? (
              <div className="activity-list">
                {stats.recent_clicks.map((click, index) => (
                  <article className="activity-item" key={`${click.clicked_at}-${index}`}>
                    <div className="activity-time">{new Date(click.clicked_at).toLocaleString()}</div>
                    <div className="activity-row">
                      <Globe size={14} />
                      <span>{click.referrer || 'Direct traffic'}</span>
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
                          'Unknown device'}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="modal-state">Clicks will appear here as visitors start using this link.</div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
