"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionPreview = sessionPreview;
/** Preview only the public reply; internal markup belongs inside the chat's folded details. */
function sessionPreview(value) {
    return (value || '')
        .replace(/&lt;(\/?think(?:ing)?)&gt;/gi, '<$1>')
        .replace(/<think(?:ing)?(?:\s[^>]*)?>[\s\S]*?(?:<\/think(?:ing)?\s*>|$)/gi, '')
        .replace(/<\/?think(?:ing)?\s*>/gi, '')
        .replace(/<\/?[a-z][a-z0-9_-]*(?:\s[^>\n]*)?>/gi, '')
        .replace(/\s+/g, ' ').trim().slice(0, 160);
}
