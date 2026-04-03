import { useState } from 'react';
import { Button, Popconfirm, Tag } from 'antd';
import { BarChart2, Calendar, Check, Copy, ExternalLink, QrCode, Tag as TagIcon, Trash2 } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface LinkCardProps {
  record: ShortenedURL;
  getShortUrl: (record: Pick<ShortenedURL, 'short_url' | 'short_code'>) => string;
  onCopy: (text: string) => Promise<void>;
  onShowQr: (shortCode: string) => void;
  onShowStats: (shortCode: string, shortUrl: string) => Promise<void>;
  onDelete: (shortCode: string) => Promise<void>;
}

export function LinkCard({ record, getShortUrl, onCopy, onShowQr, onShowStats, onDelete }: LinkCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyClick = async () => {
    await onCopy(getShortUrl(record));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <Button onClick={() => handleCopyClick()} icon={copied ? <Check size={15} color="green" /> : <Copy size={15} />} />
          <Button onClick={() => onShowQr(record.short_code)} icon={<QrCode size={15} />} />
          <Button onClick={() => onShowStats(record.short_code, getShortUrl(record))} icon={<BarChart2 size={15} />} />
          <Popconfirm
            title="Delete this link?"
            description="This also removes its analytics history."
            okText="Delete"
            cancelText="Cancel"
            placement="topRight"
            onConfirm={() => onDelete(record.short_code)}
          >
            <Button danger icon={<Trash2 size={15} />} />
          </Popconfirm>
        </div>
      </div>

      <div className="link-meta">
        <Tag bordered={false} className="meta-tag">
          {record.click_count} clicks{record.max_clicks ? ` / ${record.max_clicks}` : ''}
        </Tag>
        <Tag bordered={false} className="meta-tag">
          <Calendar size={12} />
          {new Date(record.created_at).toLocaleDateString()}
        </Tag>
        {record.tag ? (
          <Tag bordered={false} className="meta-tag">
            <TagIcon size={12} />
            {record.tag}
          </Tag>
        ) : null}
        {record.expires_at ? (
          <Tag bordered={false} className="meta-tag subtle-tag">
            Expires {new Date(record.expires_at).toLocaleDateString()}
          </Tag>
        ) : null}
      </div>
    </article>
  );
}

// TODO: Add copy to clipboard functionality

// TODO: Add native share API integration

// TODO: Add link preview with Open Graph data

// TODO: Add infinite scroll for link list

// TODO: Add skeleton loading state

// TODO: Add empty state illustration

// TODO: Add delete confirmation dialog

// TODO: Add native Web Share API integration
