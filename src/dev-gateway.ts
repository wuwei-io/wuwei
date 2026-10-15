// A local dev session may redirect only Wuwei hosted traffic to loopback.
export function devGatewayUrl(url: string): string {
  if (process.env.NODE_ENV !== 'development' || !process.env.WUWEI_DEV_GATEWAY_ORIGIN) return url;
  const target = new URL(process.env.WUWEI_DEV_GATEWAY_ORIGIN);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || target.username || target.password || target.search || target.hash || target.pathname !== '/') throw Error('Development gateway must be a loopback HTTP origin');
  const original = new URL(url);
  if (original.protocol !== 'https:' || !['wuweiai.io', 'gw.wuweiai.io'].includes(original.hostname) || original.port
    || !original.pathname.startsWith('/api/gateway/') || original.username || original.password) return url;
  return target.origin + original.pathname + original.search;
}
