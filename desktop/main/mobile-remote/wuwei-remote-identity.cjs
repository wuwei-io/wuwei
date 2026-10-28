'use strict';
const { createHash } = require('node:crypto');
// Remote registration has its own namespace. Licensing/telemetry keep the hardware ID.
function remoteIdentity({ deviceId, edition, packaged, installPath, platform }) {
    if (typeof deviceId !== 'string' || !deviceId || typeof installPath !== 'string' || !installPath)
        throw Error('Remote identity inputs missing');
    let location = installPath.replaceAll('\\', '/').replace(/\/+$/, '');
    if (platform === 'win32')
        location = location.toLowerCase();
    return 'wd_' + createHash('sha256').update(JSON.stringify(['remote-v1', deviceId, edition || 'default', !!packaged, location])).digest('hex').slice(0, 32);
}
module.exports = { remoteIdentity };
