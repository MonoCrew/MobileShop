import React from "react";
import { WHATSAPP_QR_DATA_URL } from "../../assets/qrCodeData";

export const WHATSAPP_LINK =
  "https://chat.whatsapp.com/DovreQRwrS0KSI71UyMpIo";

export default function ReceiptWhatsAppQr() {
  return (
    <div className="text-center my-2 receipt-qr-block" style={{ flexShrink: 0 }}>
      <a
        href={WHATSAPP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className="d-inline-flex flex-column align-items-center text-decoration-none text-dark"
        title="Click to open WhatsApp or scan QR code"
      >
        <div
          className="p-1.5 rounded bg-white border border-dark border-opacity-25"
          style={{ display: "inline-block", background: "#ffffff" }}
        >
          <img
            src={WHATSAPP_QR_DATA_URL}
            alt="WhatsApp QR Code"
            style={{
              width: "95px",
              height: "95px",
              objectFit: "contain",
              display: "block",
              imageRendering: "pixelated",
            }}
          />
        </div>
        <div className="mt-1 d-flex flex-column align-items-center">
          <span
            className="text-dark fw-bold"
            style={{ fontSize: "0.68rem", letterSpacing: "0.2px" }}
          >
            Scan or Tap for WhatsApp
          </span>
        </div>
      </a>
    </div>
  );
}
