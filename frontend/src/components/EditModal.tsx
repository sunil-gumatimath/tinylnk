import { useEffect } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal } from 'antd';
import { Pencil } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface EditModalProps {
  open: boolean;
  loading: boolean;
  record: ShortenedURL | null;
  /** Save failure shown inside the modal; null/undefined hides it. */
  error?: string | null;
  onSave: (shortCode: string, data: EditFormValues) => Promise<void>;
  onClose: () => void;
}

export interface EditFormValues {
  original_url: string;
  custom_alias: string;
  tag: string;
  expires_in_hours: number | null;
  max_clicks: number | null;
}

export function EditModal({ open, loading, record, error, onSave, onClose }: EditModalProps) {
  const [form] = Form.useForm<EditFormValues>();

  useEffect(() => {
    if (record && open) {
      form.setFieldsValue({
        original_url: record.original_url,
        // Backend responses now carry the alias separately from short_code
        // (which always holds a value), so the field can actually prefill —
        // and clearing it removes the alias.
        custom_alias: record.custom_alias ?? '',
        tag: record.tag ?? '',
        expires_in_hours: null,
        max_clicks: record.max_clicks,
      });
    }
  }, [record, open, form]);

  const handleSubmit = async () => {
    if (!record) return;
    try {
      const values = await form.validateFields();
      await onSave(record.short_code, values);
    } catch {
      // Validation errors handled by form
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={520}
      title={
        <div className="modal-title">
          <Pencil size={18} />
          Edit link
        </div>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" loading={loading} onClick={handleSubmit}>
          Save changes
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" className="edit-form">
        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form.Item
          name="original_url"
          label="Destination URL"
          rules={[{ required: true, message: 'Enter the destination URL.' }]}
        >
          <Input placeholder="https://example.com/..." />
        </Form.Item>

        <Form.Item
          name="custom_alias"
          label="Custom alias"
          extra="Use 3–50 letters, numbers, hyphens, or underscores. Changing or removing an alias stops the old alias from working; update any links or QR codes you have shared."
        >
          <Input placeholder="my-link" />
        </Form.Item>

        <div className="edit-form-grid">
          <Form.Item name="tag" label="Tag (optional)">
            <Input placeholder="marketing" />
          </Form.Item>

          <Form.Item
            name="max_clicks"
            label="Click limit"
            extra="Applies to total clicks, including existing clicks. Leave blank or enter 0 for no limit."
          >
            <InputNumber style={{ width: '100%' }} min={0} placeholder="Unlimited" />
          </Form.Item>

          <Form.Item
            name="expires_in_hours"
            label="New expiry (hours from now)"
            extra="Leave blank to keep the current expiry. Enter 0 to remove it, or a duration to start from when you save."
          >
            <InputNumber style={{ width: '100%' }} min={0} max={8760} placeholder="No change" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
