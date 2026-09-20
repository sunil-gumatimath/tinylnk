import { useState } from 'react';
import { Button, Popconfirm, Tag, Tooltip } from 'antd';
import {
  BarChart2,
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  MousePointerClick,
  Pencil,
  QrCode,
  Share2,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import type { ShortenedURL } from '../types';
import { linkStatus } from '../ui';

interface LinkCardProps {
  record: ShortenedURL;
  getShortUrl: (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) => string;
  onCopy: (text: string) => Promise<boolean>;
  onShowQr: (shortCode: string) => void;
  onShowStats: (shortCode: string, shortUrl: string) => void;
  onDelete: (shortCode: string) => Promise<void>;
  onEdit: (record: ShortenedURL) => void;
  onShare: (shortUrl: string) => void;
}

export function LinkCard({ record, getShortUrl, onCopy, onShowQr, onShowStats, onDelete, onEdit, onShare }: LinkCardProps) {
  const [copied, setCopied] = useState(false);
  const status = linkStatus(record);
  const statusClass =
    status === 'Expired' ? 'status-expired' : status === 'Click limit reached' ? 'status-limit' : 'status-active';
  const shortUrl = getShortUrl(record);
  const progress =
    record.max_clicks && record.max_clicks > 0
      ? Math.min(100, Math.round((record.click_count / record.max_clicks) * 100))
      : null;

  const createdLabel = new Date(record.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const expiryLabel = record.expires_at
    ? new Date(record.expires_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const handleCopyClick = async () => {
    const succeeded = await onCopy(shortUrl);
    setCopied(succeeded);
    if (succeeded) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="link-card panel-surface">
      <div className="link-card-head">
        <a
          href={shortUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="link-short"
          title={shortUrl}
        >
          <span className="link-short-code">{record.short_code}</span>
          <ExternalLink size={13} className="link-short-icon" />
        </a>
        <div className="link-head-right">
          <Tag bordered={false} className={`meta-tag status-tag ${statusClass}`}>
            <span className="status-dot" aria-hidden />
            {status === 'Click limit reached' ? 'Limit reached' : status}
          </Tag>
          <Tooltip title={copied ? 'Copied!' : 'Copy short link'}>
            <Button
              size="small"
              onClick={handleCopyClick}
              icon={copied ? <Check size={14} color="green" /> : <Copy size={14} />}
              aria-label="Copy short link"
              className="icon-btn"
            />
          </Tooltip>
        </div>
      </div>

      <p className="link-original truncate-text" title={record.original_url}>
        {record.original_url}
      </p>

      <div className="link-stats">
        <span className="link-stat">
          <MousePointerClick size={13} />
          <strong>{record.click_count}</strong>&nbsp;{record.click_count === 1 ? 'click' : 'clicks'}
          {record.max_clicks ? <span className="link-stat-muted"> / {record.max_clicks}</span> : null}
        </span>
        <span className="link-stat link-stat-muted" title={new Date(record.created_at).toLocaleString()}>
          <Calendar size={13} />
          {createdLabel}
        </span>
        {record.tag ? (
          <Tag bordered={false} className="meta-tag tag-pill">
            <TagIcon size={11} />
            <span className="truncate-text tag-pill-text">{record.tag}</span>
          </Tag>
        ) : null}
      </div>

      {progress !== null ? (
        <div
          className="click-progress"
          role="progressbar"
          aria-valuenow={record.click_count}
          aria-valuemin={0}
          aria-valuemax={record.max_clicks ?? 0}
          title={`${record.click_count} of ${record.max_clicks} clicks used`}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {expiryLabel ? (
        <p className={`link-expiry ${status === 'Expired' ? 'is-expired' : ''}`}>
          <Clock size={12} />
          {status === 'Expired' ? `Expired ${expiryLabel}` : `Expires ${expiryLabel}`}
        </p>
      ) : null}

      <div className="link-foot">
        <Button
          size="small"
          onClick={() => onShowStats(record.short_code, shortUrl)}
          icon={<BarChart2 size={14} />}
          className="analytics-btn"
        >
          Analytics
        </Button>
        <div className="link-foot-icons">
          <Tooltip title="QR code">
            <Button
              size="small"
              onClick={() => onShowQr(record.short_code)}
              icon={<QrCode size={14} />}
              aria-label="Show QR code"
              className="icon-btn"
            />
          </Tooltip>
          <Tooltip title="Share">
            <Button
              size="small"
              onClick={() => onShare(shortUrl)}
              icon={<Share2 size={14} />}
              aria-label="Share link"
              className="icon-btn"
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              size="small"
              onClick={() => onEdit(record)}
              icon={<Pencil size={14} />}
              aria-label="Edit link"
              className="icon-btn"
            />
          </Tooltip>
          <Popconfirm
            title="Delete this link?"
            description="The short link and its QR codes will stop working. Its analytics will be permanently deleted. This cannot be undone."
            okText="Delete link"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            placement="topRight"
            onConfirm={() => onDelete(record.short_code)}
          >
            <Button
              size="small"
              danger
              icon={<Trash2 size={14} />}
              aria-label="Delete link"
              className="icon-btn"
            />
          </Popconfirm>
        </div>
      </div>
    </article>
  );
}
