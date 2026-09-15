import { useState } from 'react';
import { Button, Modal } from 'antd';
import { QrCode } from 'lucide-react';

interface QrModalProps {
  open: boolean;
  /** Short code (or custom alias) of the link to render — not a URL. */
  shortCode: string | null;
  onClose: () => void;
}

const PRESET_COLORS = [
  { label: 'Black', value: 'black' },
  { label: 'Navy', value: '1d4ed8' },
  { label: 'Purple', value: '7c3aed' },
  { label: 'Teal', value: '0891b2' },
  { label: 'Green', value: '059669' },
  { label: 'Red', value: 'dc2626' },
  { label: 'Orange', value: 'f97316' },
];

const BG_COLORS = [
  { label: 'White', value: 'white' },
  { label: 'Light', value: 'f5f5f5' },
  { label: 'Cream', value: 'fffaf2' },
  { label: 'Dark', value: '1e293b' },
  { label: 'Black', value: '000000' },
];

const DEFAULT_PALETTE = { fg: 'black', bg: 'white' } as const;

export function QrModal({ open, shortCode, onClose }: QrModalProps) {
  // The palette belongs to one link: opening a different one falls back to the
  // defaults for it (derived during render — no reset effect needed), so
  // colours never leak from the previous QR code.
  const [selection, setSelection] = useState<{ code: string | null; fg: string; bg: string }>({
    code: null,
    ...DEFAULT_PALETTE,
  });
  const active =
    selection.code === shortCode ? selection : { code: shortCode, ...DEFAULT_PALETTE };

  const setFgColor = (fg: string) => setSelection({ code: shortCode, fg, bg: active.bg });
  const setBgColor = (bg: string) => setSelection({ code: shortCode, fg: active.fg, bg });

  const qrSrc = shortCode
    ? `/api/qr/${encodeURIComponent(shortCode)}?fg=${active.fg}&bg=${active.bg}`
    : null;
  const downloadName = `tinylnk-qr-${shortCode || 'code'}.png`;

  const handleDownload = async () => {
    if (!qrSrc) return;
    try {
      const response = await fetch(qrSrc);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);
    } catch {
      const anchor = document.createElement('a');
      anchor.href = qrSrc;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={460}
      title={
        <div className="modal-title">
          <QrCode size={18} />
          QR code
        </div>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button key="download" type="primary" onClick={handleDownload}>
          Download
        </Button>,
      ]}
    >
      <div className="qr-shell">
        {qrSrc ? <img src={qrSrc} alt="QR code" className="qr-image" /> : null}
      </div>

      <div className="qr-customizer">
        <div className="qr-color-group">
          <label className="qr-color-label">Foreground</label>
          <div className="qr-color-swatches">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`qr-swatch ${active.fg === c.value ? 'active' : ''}`}
                style={{ background: c.value.length === 6 ? `#${c.value}` : c.value }}
                onClick={() => setFgColor(c.value)}
                title={c.label}
              />
            ))}
          </div>
        </div>
        <div className="qr-color-group">
          <label className="qr-color-label">Background</label>
          <div className="qr-color-swatches">
            {BG_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`qr-swatch ${active.bg === c.value ? 'active' : ''}`}
                style={{ background: c.value.length === 6 ? `#${c.value}` : c.value }}
                onClick={() => setBgColor(c.value)}
                title={c.label}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
