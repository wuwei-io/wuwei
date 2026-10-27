import React from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {tr} from '../../../../../src/localization/index.js';
import {WHATSAPP_SUPPORT_URL} from '../../whatsapp-support.js';
export function BillingRewardSupport({large=false}:{large?:boolean}){
 const open=(e:React.MouseEvent<HTMLAnchorElement>)=>{if(window.wuwei?.openExternal){try{void window.wuwei.openExternal(WHATSAPP_SUPPORT_URL);e.preventDefault()}catch{/* HTTPS fallback */}}};
 return <div className={'billing-reward-support'+(large?' large':'')}><a className="billing-reward-qr" href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={open} aria-label={tr('billing.share.scan')}><QRCodeSVG value={WHATSAPP_SUPPORT_URL} size={large?80:56} level="M" marginSize={2}/></a><div><strong>{tr(large?'billing.share.contact':'billing.share.questions')}</strong><p>{tr('billing.share.scan')}</p><a className="billing-reward-contact" href={WHATSAPP_SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={open}>{tr('billing.reward.whatsapp')} <span aria-hidden="true">↗</span></a></div></div>;
}
