import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface AmbassadorQRCodeProps {
  onClose?: () => void;
}

export function AmbassadorQRCode({ onClose }: AmbassadorQRCodeProps) {
  const [copied, setCopied] = useState(false);

  const ambassadorUrl = `${window.location.origin}/ambassador/login`;

  function downloadQR() {
    const svg = document.querySelector("svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const link = document.createElement("a");
      link.download = "ambassador-access-qr.png";
      link.href = canvas.toDataURL();
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  }

  function copyLink() {
    navigator.clipboard.writeText(ambassadorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="max-h-[90vh] w-full max-w-md space-y-6 overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Ambassador Access</h2>
            <p className="text-sm text-muted-foreground mt-1">Share QR code to grant access</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-white/10 transition"
            >
              <X size={20} className="text-white/60" />
            </button>
          )}
        </div>

        <div className="flex justify-center p-4 bg-white rounded-2xl">
          <QRCodeSVG value={ambassadorUrl} size={200} level="H" includeMargin />
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Access Link</p>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <input
                type="text"
                value={ambassadorUrl}
                readOnly
                className="flex-1 bg-transparent text-sm text-white/70 focus:outline-none"
              />
              <button
                onClick={copyLink}
                className="text-xs font-medium px-2 py-1 rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button onClick={downloadQR} variant="secondary">
              <Download size={16} />
              Download QR
            </Button>
            {onClose && (
              <Button onClick={onClose} variant="outline">
                Close
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-white/80 mb-1">How to use:</p>
          <ul className="space-y-1 text-white/60">
            <li>• Scan QR code with mobile camera</li>
            <li>• Share link with other ambassadors</li>
            <li>• Direct access to ambassador login</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
