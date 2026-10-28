import React from 'react';
import {tr} from '../../../../src/localization/index.js';
import './session-expired-heading.css';

export function SessionExpiredNotice() {
  return <p id="session-expired-description" className="auth-reentry session-expired-notice" role="status">
    {tr('login.sessionExpiredDescription')}
  </p>;
}
