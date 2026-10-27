type ShortcutEvent = {
  key: string; code: string;
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
  repeat: boolean; isComposing: boolean; defaultPrevented: boolean;
};

/** Open the published announcement without changing read receipts. */
export function isAnnouncementShortcut(event: ShortcutEvent, platform: string): boolean {
  const primary = /Mac/i.test(platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  return primary && event.shiftKey && !event.altKey && !event.repeat && !event.isComposing && !event.defaultPrevented
    && (event.code === 'KeyN' || event.key.toLowerCase() === 'n');
}
