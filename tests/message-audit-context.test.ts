import test from 'node:test';
import assert from 'node:assert/strict';
import {withMessageAudit,currentMessageAudit} from '../src/media/message-audit-context.js';
test('concurrent conversations retain separate message identity across asynchronous model work',async()=>{
 const values=await Promise.all(['message-a','message-b'].map(id=>withMessageAudit(id,async()=>{await new Promise(r=>setTimeout(r,id.endsWith('a')?8:1));return currentMessageAudit()})));
 assert.deepEqual(values,['message-a','message-b']);assert.equal(currentMessageAudit(),undefined);
});
test('nested model work inherits its message identity and thrown work does not leak it',async()=>{
 await assert.rejects(withMessageAudit('message-c',async()=>{assert.equal(withMessageAudit(undefined,()=>currentMessageAudit()),'message-c');throw Error('mock failure')}));
 assert.equal(currentMessageAudit(),undefined);
});
