import test from 'node:test';
import assert from 'node:assert/strict';
import {accountScopedCredentialResolver,hostedCredentialProvider,setHostedCredentialResolver} from '../src/hosted-session-credentials.js';
import {SessionRefreshUnavailable} from '../src/wuwei-refresh.js';
const jwt=(sub:string,n:number)=>'header.'+Buffer.from(JSON.stringify({sub,n})).toString('base64url')+'.signature';

test('media keeps its account while rotating tokens, including a forced rejected token',async()=>{
 let current=jwt('A',1);const old=current,calls:(string|undefined)[]=[];
 const resolve=accountScopedCredentialResolver({currentToken:()=>current,freshToken:async rejected=>{calls.push(rejected);current=jwt('A',2);return current}});
 setHostedCredentialResolver(resolve);try{const token=hostedCredentialProvider(old);assert.equal(await token(old),current);assert.deepEqual(calls,[old]);assert.equal(await token(),current)}finally{setHostedCredentialResolver(undefined)}
});
test('switching accounts before or during refresh stops the original operation',async()=>{
 const original=jwt('A',1);let current=jwt('B',1),calls=0;
 const resolve=accountScopedCredentialResolver({currentToken:()=>current,freshToken:async()=>{calls++;current=jwt('B',2);return current}});
 await assert.rejects(resolve(original),{code:'ACCOUNT_CHANGED'});assert.equal(calls,0);
 current=original;await assert.rejects(resolve(original),{code:'ACCOUNT_CHANGED'});assert.equal(calls,1);
});
test('transient renewal failure stays retryable; a missing session is distinct',async()=>{
 const original=jwt('A',1);let current:string|undefined=original;
 const resolve=accountScopedCredentialResolver({currentToken:()=>current,freshToken:async()=>{throw new SessionRefreshUnavailable()}});
 await assert.rejects(resolve(original),SessionRefreshUnavailable);assert.equal(current,original);
 current=undefined;await assert.rejects(resolve(original),{code:'AUTH_REQUIRED'});
 assert.equal(hostedCredentialProvider('static-token')(),'static-token');
});
