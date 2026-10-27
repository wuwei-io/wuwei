import React from 'react';
import {tr} from '../../../../src/localization/index.js';
import './media-load-progress.css';

export function MediaLoadProgress({received,total}:{received?:number;total?:number|null}){
 const known=typeof received==='number'&&Number.isFinite(received)&&typeof total==='number'&&Number.isFinite(total)&&total>0&&received>=0&&received<=total;
 if(!known)return null;
 const percent=Math.floor(received/total*100);
 return <div className="media-load-progress">
  <div className="media-load-track" role="progressbar" aria-label={tr('ui.app.downloading.568fdf7')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:percent+'%'}}/></div>
  <small>{percent}%</small>
 </div>;
}
