import { useState } from 'react';
import { Button, Popconfirm, Tag } from 'antd';
import { BarChart2, Calendar, Check, Copy, ExternalLink, Pencil, QrCode, Share2, Tag as TagIcon, Trash2 } from 'lucide-react';
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

  const handleCopyClick = async () => {
    const succeeded = await onCopy(getShortUrl(record));
    setCopied(succeeded);
    if (succeeded) setTimeout(() => setCopied(false), 2000);
  };

  return (
    <article className="link-card panel-surface">
      <div className="link-card-top">
        <div className="link-copy">
          <div className="link-short">
            <a href={getShortUrl(record)} target="_blank" rel="noopener noreferrer">
              {record.short_code}
            </a>
            <ExternalLink size={14} />
          </div>
          <p className="link-original truncate-text">{record.original_url}</p>
        </div>

        <div className="link-actions">
          <Button
            onClick={() => handleCopyClick()}
            icon={copied ? <Check size={15} color="green" /> : <Copy size={15} />}
            title="Copy link"
            aria-label="Copy link"
          />
          <Button
            onClick={() => onShowQr(record.short_code)}
            icon={<QrCode size={15} />}
            title="QR code"
            aria-label="Show QR code"
          />
          <Button
            onClick={() => onShowStats(record.short_code, getShortUrl(record))}
            icon={<BarChart2 size={15} />}
            title="Analytics"
            aria-label="View analytics"
          />
          <Button
            onClick={() => onEdit(record)}
            icon={<Pencil size={15} />}
            title="Edit"
            aria-label="Edit link"
          />
          <Button
            onClick={() => onShare(getShortUrl(record))}
            icon={<Share2 size={15} />}
            title="Share"
            aria-label="Share link"
          />
          <Popconfirm
            title="Delete this link?"
            description="The short link and its QR codes will stop working. Its analytics will be permanently deleted. This cannot be undone."
            okText="Delete link"
            // The trigger is already a red/danger button — the confirm must be
            // destructive too instead of AntD's default blue primary.
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            placement="topRight"
            onConfirm={() => onDelete(record.short_code)}
          >
            <Button
              danger
              icon={<Trash2 size={15} />}
              title="Delete"
              aria-label="Delete link"
            />
          </Popconfirm>
        </div>
      </div>

      <div className="link-meta">
        <Tag bordered={false} className={`meta-tag status-tag ${statusClass}`}>
          {status}
        </Tag>
        <Tag bordered={false} className="meta-tag">
          {record.click_count} {record.click_count === 1 ? 'click' : 'clicks'}{record.max_clicks ? ` · limit ${record.max_clicks}` : ''}
        </Tag>
        <Tag bordered={false} className="meta-tag">
          <Calendar size={12} />
          Created {new Date(record.created_at).toLocaleDateString()}
        </Tag>
        {record.tag ? (
          <Tag bordered={false} className="meta-tag">
            <TagIcon size={12} />
            {record.tag}
          </Tag>
        ) : null}
        {record.expires_at ? (
          <Tag bordered={false} className="meta-tag subtle-tag">
            {status === 'Expired' ? 'Expired' : 'Expires'} {new Date(record.expires_at).toLocaleString()}
          </Tag>
        ) : null}
      </div>
    </article>
  );
}
