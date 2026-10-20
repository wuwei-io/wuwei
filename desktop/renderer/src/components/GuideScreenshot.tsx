import { tr, getCurrentLanguage } from "../../../../src/localization/index.js";
import React, { useEffect, useRef, useState } from "react";
import "./guideScreenshots.css";

type Props = { src: string; alt: string; caption: string; lang: string; marks?: { n: number; x: number; y: number }[] };
/** Local, cropped real UI captures. Markers are documentation annotations, not UI. */
export function GuideScreenshot({ src, alt, caption, lang, marks = [] }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const close = () => dialog.current?.close();
  const image = <div className="guide-capture"><img src={src} alt={alt} onError={() => setFailed(true)} />{marks.map(m => <span aria-hidden="true" key={m.n} className="guide-capture__mark" style={{left: `${m.x}%`, top: `${m.y}%`}}>{m.n}</span>)}</div>;
  return <figure className="guide-capture-figure">
    {failed ? <p role="status">{tr("ui.guidescreenshot.screenshot.unavailable.follow.the.text.steps.c561123")}</p> : <button ref={trigger} type="button" className="guide-capture-open" aria-label={`${tr("ui.guidescreenshot.enlarge.ae0d129")}：${alt}`} onClick={() => dialog.current?.showModal()}>{image}</button>}
    <figcaption>{caption}<small>{tr("ui.guidescreenshot.test.client.capture.english.ui.click.0ae20e9")}</small></figcaption>
    <dialog ref={dialog} className="guide-capture-dialog" aria-label={alt} onClose={() => trigger.current?.focus()} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <button autoFocus type="button" className="guide-capture-close" onClick={close}>{tr("ui.app.close.esc.7afe0a1")}</button>
      <div className="guide-capture-full">{image}</div><p>{caption}</p>
    </dialog>
  </figure>;
}
