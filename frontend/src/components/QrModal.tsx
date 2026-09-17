import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Modal } from 'antd';
import { QrCode } from 'lucide-react';
import { isReadableQr, saveBlob } from '../ui';

interface QrModalProps {
  open: boolean;
  /** Short code (or custom alias) of the link to render — not a URL. */
  shortCode: string | null;
  onClose: () => void;
}

const PRESET_COLORS = [
  { label: 'Black', value: 'black' },
  { label: 'Blue', value: '1d4ed8' },
  { label: 'Purple', value: '7c3aed' },
  { label: 'Teal', value: '0891b2' },
  { label: 'Green', value: '059669' },
  { label: 'Red', value: 'dc2626' },
  { label: 'Orange', value: 'f97316' },
];

// Light backgrounds only: QRs need dark modules on a light surface to scan
// reliably, and isReadableQr() would disable every foreground swatch on a
// dark background anyway — so don't offer palettes that can't scan.
const BG_COLORS = [
  { label: 'White', value: 'white' },
  { label: 'Light gray', value: 'f5f5f5' },
  { label: 'Cream', value: 'fffaf2' },
];

const DEFAULT_PALETTE = { fg: 'black', bg: 'white' } as const;

export function QrModal({ open, shortCode, onClose }: QrModalProps) {
  const { message } = AntdApp.useApp();
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
  const [imageFailed, setImageFailed] = useState(false);
  // Reset the preview-error state whenever the rendered QR changes.
  useEffect(() => setImageFailed(false), [qrSrc]);

  const handleDownload = async () => {
    if (!qrSrc) return;
    try {
      const response = await fetch(qrSrc);
      if (!response.ok) throw new Error('QR download failed');
      saveBlob(await response.blob(), downloadName);
    } catch {
      message.error('Could not download the QR code. Please try again.');
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
          Download PNG
        </Button>,
      ]}
    >
      <div className="qr-shell">
        {qrSrc ? (
          imageFailed ? (
            <p className="modal-state">Could not load the QR code. Close this dialog and open it again to retry.</p>
          ) : (
            <img
              src={qrSrc}
              alt={`QR code for short link ${shortCode}`}
              className="qr-image"
              onError={() => setImageFailed(true)}
            />
          )
        ) : null}
      </div>

      <p className="dashboard-subtitle">
        Scan to open the short link. Low-contrast color combinations are disabled.
        Test the downloaded QR code before printing or sharing it.
      </p>
      <div className="qr-customizer">
        <div className="qr-color-group">
          <label className="qr-color-label">Code color</label>
          <div className="qr-color-swatches">
            {PRESET_COLORS.map((c) => {
              const readable = isReadableQr(c.value, active.bg);
              return (
                <button
                  key={c.value}
                  type="button"
                  className={`qr-swatch ${active.fg === c.value ? 'active' : ''}`}
                  style={{ background: c.value.length === 6 ? `#${c.value}` : c.value }}
                  onClick={() => setFgColor(c.value)}
                  disabled={!readable}
                  aria-pressed={active.fg === c.value}
                  aria-label={`${c.label} code color`}
                  title={readable ? c.label : `${c.label} — too low-contrast on this background`}
                />
              );
            })}
          </div>
        </div>
        <div className="qr-color-group">
          <label className="qr-color-label">Background</label>
          <div className="qr-color-swatches">
            {BG_COLORS.map((c) => {
              const readable = isReadableQr(active.fg, c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  className={`qr-swatch ${active.bg === c.value ? 'active' : ''}`}
                  style={{ background: c.value.length === 6 ? `#${c.value}` : c.value }}
                  onClick={() => setBgColor(c.value)}
                  disabled={!readable}
                  aria-pressed={active.bg === c.value}
                  aria-label={`${c.label} background`}
                  title={readable ? c.label : `${c.label} — unreadable with this color`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
