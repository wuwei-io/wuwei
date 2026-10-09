import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeAnnouncementUrl } from "./announcementContent.js";

/** No raw HTML plugin, remote images or arbitrary URL schemes. Matches admin preview policy. */
export function AnnouncementMarkdown({ children }: { children: string }) {
  return <div className="announce-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeAnnouncementUrl} components={{
    img: () => null,
    a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
  }}>{children}</ReactMarkdown></div>;
}
