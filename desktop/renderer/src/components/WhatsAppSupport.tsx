import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { tr } from "../../../../src/localization/index.js";
import { WHATSAPP_SUPPORT_URL } from "../whatsapp-support.js";
import "./whatsapp-support.css";

export function WhatsAppSupport({ compact = false, source = "support" }: {
  compact?: boolean;
  source?: "support" | "payment";
}) {
  const [showQr, setShowQr] = useState(!compact);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const url = WHATSAPP_SUPPORT_URL;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };
  if (compact || source === "payment") return <p className="wa-support-inline">
    <span>{tr(source === "payment" ? "ui.app.payment.issue.contact.support.029c8ab" : "pay.support.title")}</span>
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
      if (window.wuwei?.openExternal) {
        try { window.wuwei.openExternal(url); event.preventDefault(); }
        catch { /* Keep the HTTPS link as a browser fallback. */ }
      }
    }}>WhatsApp <span aria-hidden="true">↗</span></a>
  </p>;
  return <section className="wa-support" aria-label="WhatsApp">
    <div className="wa-support-heading">
      <div><strong>WhatsApp</strong><p>WuweiAI · {tr("pay.support.title")}</p></div>
      <a className="wa-support-chat" href={url} target="_blank" rel="noopener noreferrer" onClick={event => {
        if (window.wuwei?.openExternal) {
          try { window.wuwei.openExternal(url); event.preventDefault(); }
          catch { /* Keep the HTTPS link as a browser fallback. */ }
        }
      }}>{tr("whatsapp.chat")}</a>
    </div>
    <button type="button" className="wa-support-toggle" aria-expanded={showQr} onClick={() => setShowQr(value => !value)}>
      {tr(showQr ? "set.m.hide" : "whatsapp.scan")}
    </button>
    {showQr && <div className="wa-support-details">
      <div className="wa-support-qr" role="img" aria-label={tr("whatsapp.scan")}>
        <QRCodeSVG value={url} size={152} level="M" marginSize={4} />
      </div>
      <button type="button" className="wa-support-copy" onClick={() => void copyLink()}>
        {tr(copyState === "copied" ? "pay.support.copied" : "pay.support.copy")}
      </button>
      {copyState === "failed" && <>
        <span className="wa-support-status" role="status">{tr("ui.billingorderview.copy.failed.please.select.and.copy.5191893")}</span>
        <input readOnly aria-label="WhatsApp" value={url} onFocus={event => event.currentTarget.select()} style={{ width: "100%" }} />
      </>}
    </div>}
  </section>;
}
