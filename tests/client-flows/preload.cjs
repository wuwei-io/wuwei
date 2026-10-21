// Isolated renderer bridge: never imports application main/session/database code.
const { contextBridge, ipcRenderer } = require('electron');
const names = ipcRenderer.sendSync('qa:methods');
const api = Object.fromEntries(names.map(name => [name, (...args) => ipcRenderer.invoke('qa:api', name, args)]));
api.platform = 'win32';
api.systemLanguage = process.argv.find(arg=>arg.startsWith('--qa-system-lang='))?.slice('--qa-system-lang='.length);
api.onEvent = callback => {
  const listener = (_event, channel, payload) => callback(channel, payload);
  ipcRenderer.on('qa:event', listener);
  return () => ipcRenderer.removeListener('qa:event', listener);
};
contextBridge.exposeInMainWorld('wuwei', api);
window.addEventListener('DOMContentLoaded', () => { sessionStorage.setItem('wuwei_splash_shown', '1'); });
try {
  localStorage.setItem('wuwei_lang', process.argv.find(arg=>arg.startsWith('--qa-lang='))?.slice('--qa-lang='.length) || 'zh');
  localStorage.setItem('wuwei-onboarding-done', '1');
  sessionStorage.setItem('wuwei_splash_shown', '1');
} catch {}
