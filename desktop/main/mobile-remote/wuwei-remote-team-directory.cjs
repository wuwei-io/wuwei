'use strict';
const { createHash } = require('node:crypto');
const thumbnails = new Map();
function thumbnail(value, imageFromDataURL) {
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(value || '') || value.length > 2 * 1024 * 1024)
        return '';
    const key = createHash('sha256').update(value).digest('hex');
    if (thumbnails.has(key))
        return thumbnails.get(key);
    let result = '';
    try {
        const image = imageFromDataURL(value);
        if (!image.isEmpty()) {
            const jpeg = image.resize({ width: 80, height: 80, quality: 'good' }).toJPEG(65);
            if (jpeg.length <= 8000)
                result = 'data:image/jpeg;base64,' + jpeg.toString('base64');
        }
    }
    catch { }
    thumbnails.set(key, result);
    if (thumbnails.size > 128)
        thumbnails.delete(thumbnails.keys().next().value);
    return result;
}
function teamDirectory(employees, params, imageFromDataURL, enabled = true) {
    const rows = (enabled ? employees : []).map(e => ({ id: e.id, name: e.name, title: e.title || '', blurb: (e.blurb || '').slice(0, 120), icon: e.icon || '', avatarData: thumbnail(e.avatarData, imageFromDataURL) }));
    const revision = createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 24);
    return params?.sinceRevision === revision ? { enabled, revision, unchanged: true } : { enabled, revision, employees: rows };
}
module.exports = { teamDirectory };
