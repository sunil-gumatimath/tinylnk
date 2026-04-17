import { useState } from 'react';
import { Button, Modal } from 'antd';
import { QrCode } from 'lucide-react';

interface QrModalProps {
  open: boolean;
  currentQrUrl: string | null;
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

export function QrModal({ open, currentQrUrl, onClose }: QrModalProps) {
  const [fgColor, setFgColor] = useState('black');
  const [bgColor, setBgColor] = useState('white');

  // Build URL with color params
  const qrSrc = currentQrUrl
    ? `${currentQrUrl}?fg=${encodeURIComponent(fgColor)}&bg=${encodeURIComponent(bgColor)}`
    : null;

  const handleDownload = () => {
    if (!qrSrc) return;
    const anchor = document.createElement('a');
    anchor.href = qrSrc;
    anchor.download = 'tinylnk-qr.png';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
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
                className={`qr-swatch ${fgColor === c.value ? 'active' : ''}`}
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
                className={`qr-swatch ${bgColor === c.value ? 'active' : ''}`}
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
