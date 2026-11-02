import React, {useCallback, useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import type {WuweiMe} from '../../../main/wuwei-auth.js';
import type {AccountWallet} from '../../../../src/billing/contracts.js';
import {isAccountWallet, accountWalletDaily, walletCountdown, walletBatchSourceKey} from '../../../../src/account-wallet.js';
import {getAccountFooterLayout, subscribeAccountFooterLayout} from '../../../../src/account-footer-config.js';
import {formatCredits} from '../../../../src/billing/presentation.js';
import {tr, getCurrentLanguage} from '../../../../src/localization/index.js';
import {billingRequest} from './billing/request.js';
import './account-footer.css';
export const useAccountFooterLayout = () => useSyncExternalStore(subscribeAccountFooterLayout, getAccountFooterLayout, getAccountFooterLayout);
type Props = {
  layout: 'classic' | 'wallet'; account: WuweiMe | null; avatar: React.ReactNode;
  classicTrigger: React.ReactNode; children: React.ReactNode; menuOpen: boolean;
  onMenuChange: (open: boolean) => void; onPay: () => void; onDetails: () => void;
  unread: number; onCheckin: () => Promise<boolean>; checkinBusy: boolean;
};
function Icon({kind}: {kind: 'coin' | 'plus' | 'spark' | 'arrow' | 'refresh'}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{
    kind === 'coin' ? <g transform="translate(0 1.25)"><circle cx="10" cy="10" r="6.5"/><path d="M10 7v6m-2-5h3a1 1 0 0 1 0 2H9a1 1 0 0 0 0 2h3m3-6a6.5 6.5 0 1 1-9 9"/></g> :
    kind === 'plus' ? <path d="M12 5v14M5 12h14"/> : kind === 'spark' ? <path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/> :
    kind === 'arrow' ? <path d="M4 12h16m-6-6 6 6-6 6"/> : <><path d="M20 5v6h-6M4 19v-6h6"/><path d="M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3A8 8 0 0 0 19 16"/></>
  }</svg>;
}
export function AccountFooter(p: Props) {
  const root = useRef<HTMLDivElement>(null), closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressFocus = useRef(false);
  const claimPending = useRef(false);
  const [claiming, setClaiming] = useState(false), [claimError, setClaimError] = useState(false);
  const epoch = useRef(0), loading = useRef(false), owner = useRef(p.account?.user.id);
  owner.current = p.account?.user.id;
  const [walletOpen, setWalletOpen] = useState(false), [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<AccountWallet | null>(null), [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now());
  const clock = useRef({server: Date.now(), observed: performance.now()});
  const panelId = useId(), lang = getCurrentLanguage();
  const data = snapshot?.userId === p.account?.user.id ? snapshot : null;
  const daily = accountWalletDaily(data);
  useEffect(() => { setSnapshot(null); }, [p.account?.coin.balance]);
  const cancelClose = () => { clearTimeout(closeTimer.current); };
  const close = useCallback(() => { setWalletOpen(false); p.onMenuChange(false); }, [p.onMenuChange]);
  useEffect(() => {
    epoch.current++; loading.current = false; claimPending.current = false; setClaiming(false); setClaimError(false); setBusy(false); setSnapshot(null); setError(false); setWalletOpen(false); p.onMenuChange(false);
    return () => { epoch.current++; clearTimeout(closeTimer.current); };
  }, [p.account?.user.id, p.layout]);
  useEffect(() => {
    if (p.layout !== 'wallet') return;
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    const keyboard = (e: KeyboardEvent) => { if (e.key === 'Escape') { const target = root.current?.querySelector<HTMLButtonElement>('[aria-expanded=true]'); close(); if (target && document.activeElement !== target) { suppressFocus.current = true; target.focus({preventScroll:true}); queueMicrotask(() => { suppressFocus.current = false; }); } } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); };
  }, [p.layout, close]);
  const load = useCallback(async (manual = false) => {
    const userId = owner.current; if (!userId || loading.current || claimPending.current) return;
    const generation = epoch.current; loading.current = true; setBusy(true); setError(false);
    const [result] = await Promise.all([billingRequest({action: 'wallet'}, 15000), manual ? new Promise<void>(resolve => setTimeout(resolve, 450)) : Promise.resolve()]);
    if (generation !== epoch.current || owner.current !== userId) return;
    loading.current = false; setBusy(false);
    if (isAccountWallet(result, userId)) { clock.current = {server: Date.parse(result.asOf), observed: performance.now()}; setSnapshot(result); setNow(clock.current.server); }
    else { setError(true); if ('error' in result && ['not_logged_in', 'unauthorized'].includes(result.error)) setSnapshot(null); }
  }, []);
  useEffect(() => {
    if (!walletOpen || !p.account) return;
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    const ticker = setInterval(() => setNow(clock.current.server + performance.now() - clock.current.observed), 1000);
    return () => { clearInterval(timer); clearInterval(ticker); };
  }, [walletOpen, p.account?.coin.balance, load]);
  useEffect(() => {
    if (!walletOpen || !data) return;
    const deadlines = [...data.batches.map(b => Date.parse(b.expiresAt)), ...(daily ? [Date.parse(daily.resetsAt)] : [])]
      .filter(at => at > Date.parse(data.asOf));
    if (!deadlines.length) return;
    const delay = Math.min(2147483647, Math.max(0, Math.min(...deadlines) - (clock.current.server + performance.now() - clock.current.observed)) + 100);
    const timer = setTimeout(() => { void load(); }, delay);
    return () => clearTimeout(timer);
  }, [walletOpen, data, load]);
  const claim = async () => {
    const userId = owner.current, generation = epoch.current;
    if (!userId || claimPending.current || loading.current || p.checkinBusy || daily?.claimed) return;
    claimPending.current = true; setClaiming(true); setClaimError(false);
    try {
      const ok = await p.onCheckin();
      if (owner.current !== userId || epoch.current !== generation) return;
      claimPending.current = false;
      if (ok) await load(); else setClaimError(true);
    } catch {
      if (owner.current === userId && epoch.current === generation) setClaimError(true);
    } finally {
      if (owner.current === userId && epoch.current === generation) { claimPending.current = false; setClaiming(false); }
    }
  };
  const countdown = (at: string) => {
    const remaining = walletCountdown(Date.parse(at) - now);
    return remaining ? tr(remaining.days ? 'account.wallet.countdownDays' : 'account.wallet.countdown', {...remaining}) : tr('account.wallet.resetPending');
  };
  const openWallet = () => { cancelClose(); p.onMenuChange(false); setWalletOpen(true); };
  const openMenu = () => { cancelClose(); setWalletOpen(false); p.onMenuChange(true); };
  const pay = () => { close(); p.onPay(); };
  const details = () => { close(); p.onDetails(); };
  return <div className={'account-footer-shell account-footer-' + p.layout} ref={root}
    onMouseEnter={cancelClose} onMouseLeave={() => { if (p.layout === 'wallet' && !claiming) closeTimer.current = setTimeout(close, 220); }}
    onBlur={e => { if (p.layout === 'wallet' && !e.currentTarget.contains(e.relatedTarget as Node)) close(); }}>
    {p.layout === 'classic' ? p.classicTrigger : <>
      <button type="button" className="account-upgrade" title={tr('menu.annualDiscount')} onClick={pay}><Icon kind="spark"/><span>{tr('menu.upgradeEntry')}</span><span className="account-upgrade-discount" aria-hidden="true">−50%</span></button>
      <div className="account-footer-row">
        <div className="account-coin-pill" onMouseEnter={openWallet}>
          <button type="button" className="account-coin-balance" aria-label={tr('account.wallet.balance')} aria-expanded={walletOpen} aria-controls={panelId}
            onFocus={() => { if (!suppressFocus.current) openWallet(); }} onClick={openWallet}>
            <Icon kind="coin"/><span>{p.account ? formatCredits(data?.balance ?? p.account.coin.balance) : '—'}</span>
          </button>
          <button type="button" className="account-coin-add" aria-label={tr('account.wallet.topup')} onClick={pay}><Icon kind="plus"/></button>
        </div>
        <button type="button" className="account-avatar-only" aria-label={tr('account.wallet.menu')} aria-expanded={p.menuOpen}
          onMouseEnter={openMenu} onFocus={() => { if (!suppressFocus.current) openMenu(); }} onClick={openMenu}>
          {p.avatar}{p.unread > 0 && <span className="account-unread-dot"/>}
        </button>
      </div>
      {walletOpen && <div className="account-wallet-popover" id={panelId} role="region" aria-label={tr('account.wallet.balance')} onMouseEnter={cancelClose}>
        <div className="account-wallet-heading"><span>{tr('account.wallet.balance')}</span><button type="button" className={'account-wallet-refresh' + (busy ? ' is-refreshing' : '')} disabled={busy || !p.account} aria-busy={busy} aria-label={tr('account.wallet.refresh')} title={tr('account.wallet.refresh')} onClick={() => { void load(true); }}><Icon kind="refresh"/></button></div>
        <div className="account-wallet-total">{p.account ? formatCredits(data?.balance ?? p.account.coin.balance) : '—'} <small>{tr('account.wallet.unit')}</small></div>
        <div className="account-wallet-plan"><span>{tr('account.wallet.plan')}</span><strong>{data ? data.plan.name ?? tr(data.plan.member ? 'account.wallet.member' : 'account.wallet.free') : p.account?.membership?.plan ?? tr(p.account?.membership?.tier && p.account.membership.tier !== 'free' ? 'account.wallet.member' : 'account.wallet.free')}{data?.plan.period && <small> · {tr('account.wallet.' + (['monthly','annual','trial','pack'].includes(data.plan.period) ? data.plan.period : 'member'))}</small>}</strong></div>
        {data?.plan.endsAt && <div className="account-wallet-plan-end">{tr('account.wallet.membershipEnds', {date: new Date(data.plan.endsAt).toLocaleDateString(lang)})}</div>}
        {!p.account ? <p className="account-wallet-status">{tr('account.wallet.login')}</p> : <>
          {error && <div className="account-wallet-status" role="status">{tr(data ? 'account.wallet.stale' : 'account.wallet.unavailable')}</div>}
          {!data && !error && <div className="account-wallet-status" role="status">{tr('account.wallet.loading')}</div>}
          {data && <>
            <section className="account-wallet-permanent">
              <div className="account-wallet-section"><span>{tr('account.wallet.permanent')}</span><strong>{formatCredits(data.permanent)} {tr('account.wallet.unit')}</strong></div>
              <p className="account-wallet-muted">{tr('account.wallet.noLimit')}</p>
            </section>
            <section className="account-wallet-expiring">
              <div className="account-wallet-section"><span>{tr('account.wallet.expiringBalance')}</span><strong>{formatCredits(data.expiring)} {tr('account.wallet.unit')}</strong></div>
              <div className="account-wallet-batches">{data.batches.length ? data.batches.map((batch, index) => <div key={batch.expiresAt + batch.source + index} className="account-wallet-batch">
                <div><span>{tr(walletBatchSourceKey(batch))}</span><strong>{formatCredits(batch.remaining)} {tr('account.wallet.unit')}</strong></div>
                <div className="account-wallet-countdown">{Date.parse(batch.expiresAt) <= now ? tr('account.wallet.expiring') : countdown(batch.expiresAt)}</div>
                <time dateTime={batch.expiresAt} title={new Date(batch.expiresAt).toLocaleString(lang)}>{tr('account.wallet.expires', {time: new Date(batch.expiresAt).toLocaleString(lang, {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})})}</time>
              </div>) : <p>{tr('account.wallet.noExpiry')}</p>}</div>
            </section>
            {!daily?.claimed && <section className="account-wallet-daily">
              {daily ? <>
                <button type="button" className="account-wallet-checkin" disabled={busy || claiming || p.checkinBusy || daily.amount + daily.bonus <= 0} aria-busy={claiming || p.checkinBusy}
                  title={tr(daily.expiryHours === null ? 'account.wallet.dailyPermanent' : 'account.wallet.dailyExpiry', {hours: daily.expiryHours ?? 0})} onClick={() => { void claim(); }}>
                  {(claiming || p.checkinBusy) && <span className="acct-checkin-spin" aria-hidden="true"/>}
                  {tr(claiming || p.checkinBusy ? 'account.wallet.claiming' : 'account.wallet.claim', {amount: formatCredits(daily.amount + daily.bonus)})}
                </button>
                {claimError && <p className="account-wallet-claim-error" role="status">{tr('account.wallet.claimFailed')}</p>}
              </> : <p className="account-wallet-muted">{tr('account.wallet.dailyUnavailable')}</p>}
            </section>}

          </>}
        </>}
        <button type="button" className="account-wallet-details" onClick={details}>{tr('account.wallet.details')}<Icon kind="arrow"/></button>
      </div>}
    </>}
    {p.children}
  </div>;
}
