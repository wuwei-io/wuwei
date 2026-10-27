import React from 'react';
import {tr} from '../../../../src/localization/index.js';
import './studio-composer-toggle.css';

export function StudioComposerToggle({collapsed,onToggle}:{collapsed:boolean;onToggle:()=>void}) {
 if(collapsed)return null;
 const label=tr('media.collapsePrompt');
 return <button type="button" className="studio-composer-toggle" data-studio-collapse aria-label={label} title={label} aria-expanded={!collapsed} onClick={onToggle}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
 </button>;
}
