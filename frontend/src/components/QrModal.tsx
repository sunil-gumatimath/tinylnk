import { Button, Modal } from 'antd';
import { QrCode } from 'lucide-react';

interface QrModalProps {
  open: boolean;
  currentQrUrl: string | null;
  onClose: () => void;
}

export function QrModal({ open, currentQrUrl, onClose }: QrModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={420}
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
        <Button
          key="download"
          type="primary"
          onClick={() => {
            if (!currentQrUrl) return;
            const anchor = document.createElement('a');
            anchor.href = currentQrUrl;
            anchor.download = 'tinylnk-qr.png';
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
          }}
        >
          Download
        </Button>,
      ]}
    >
      <div className="qr-shell">
        {currentQrUrl ? <img src={currentQrUrl} alt="QR code" className="qr-image" /> : null}
      </div>
    </Modal>
  );
}

// TODO: Add QR code color customization

// TODO: Add QR code download as PNG/SVG

// TODO: Add focus trap in modal

// TODO: Add QR code color customization options

// TODO: Add SVG download option for QR codes
