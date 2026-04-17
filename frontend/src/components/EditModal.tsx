import { useEffect } from 'react';
import { Button, Form, Input, InputNumber, Modal } from 'antd';
import { Pencil } from 'lucide-react';
import type { ShortenedURL } from '../types';

interface EditModalProps {
  open: boolean;
  loading: boolean;
  record: ShortenedURL | null;
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

export function EditModal({ open, loading, record, onSave, onClose }: EditModalProps) {
  const [form] = Form.useForm<EditFormValues>();

  useEffect(() => {
    if (record && open) {
      form.setFieldsValue({
        original_url: record.original_url,
        custom_alias: record.short_code,
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
      <Form form={form} layout="vertical" className="edit-form" style={{ marginTop: 16 }}>
        <Form.Item
          name="original_url"
          label="Destination URL"
          rules={[{ required: true, message: 'URL is required.' }]}
        >
          <Input placeholder="https://example.com/..." />
        </Form.Item>

        <Form.Item name="custom_alias" label="Custom alias">
          <Input placeholder="my-link" />
        </Form.Item>

        <div className="edit-form-grid">
          <Form.Item name="tag" label="Tag">
            <Input placeholder="marketing" />
          </Form.Item>

          <Form.Item name="max_clicks" label="Max clicks">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="Unlimited" />
          </Form.Item>

          <Form.Item
            name="expires_in_hours"
            label="Reset expiry (hours from now)"
            tooltip="Leave empty to keep current expiry. Set 0 to remove expiry."
          >
            <InputNumber style={{ width: '100%' }} min={0} max={8760} placeholder="No change" />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
