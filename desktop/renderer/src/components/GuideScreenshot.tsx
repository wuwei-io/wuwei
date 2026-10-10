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
    {failed ? <p role="status">{lang === "en" ? "Screenshot unavailable; follow the text steps below." : "截图加载失败，请参考下方文字步骤。"}</p> : <button ref={trigger} type="button" className="guide-capture-open" aria-label={`${lang === "en" ? "Enlarge" : "放大"}：${alt}`} onClick={() => dialog.current?.showModal()}>{image}</button>}
    <figcaption>{caption}<small>{lang === "en" ? "Test client capture · English UI · Click to enlarge. Numbers are guide annotations." : "测试客户端实截 · 中文界面 · 点击放大；编号为手册标注。"}</small></figcaption>
    <dialog ref={dialog} className="guide-capture-dialog" aria-label={alt} onClose={() => trigger.current?.focus()} onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <button autoFocus type="button" className="guide-capture-close" onClick={close}>{lang === "en" ? "Close (Esc)" : "关闭（Esc）"}</button>
      <div className="guide-capture-full">{image}</div><p>{caption}</p>
    </dialog>
  </figure>;
}
