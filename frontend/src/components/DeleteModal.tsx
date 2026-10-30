import { Alert, Button, Modal } from 'antd';
import { Trash2 } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface DeleteModalProps {
  open: boolean;
  record: ShortenedURL | null;
  loading: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteModal({
  open,
  record,
  loading,
  error,
  onConfirm,
  onClose,
}: DeleteModalProps) {
  const code = record ? record.custom_alias || record.short_code : '';

  return (
    <Modal
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Trash2 size={18} style={{ color: 'var(--color-danger, #ef4444)' }} />
          <span>Delete short link?</span>
        </span>
      }
      open={open}
      onCancel={() => {
        if (!loading) onClose();
      }}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={loading}>
          Cancel
        </Button>,
        <Button
          key="delete"
          danger
          type="primary"
          loading={loading}
          onClick={onConfirm}
        >
          Delete link
        </Button>,
      ]}
      centered
      destroyOnClose
    >
      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <p style={{ marginBottom: 12, lineHeight: 1.5 }}>
        Are you sure you want to delete this short link? Its short URL and QR codes will stop working, and its analytics will be permanently removed. This cannot be undone.
      </p>

      {record && (
        <div
          className="panel-surface"
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            marginBottom: 12,
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>{code}</div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.75,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={record.original_url}
          >
            {record.original_url}
          </div>
        </div>
      )}
    </Modal>
  );
}
