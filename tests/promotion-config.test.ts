import test from 'node:test';
import assert from 'node:assert/strict';
import {setRegistrationGiftAmount,promotionMessageValues} from '../src/promotion-config.js';
import {tr} from '../src/localization/index.js';
import {gatewayLimitMessage} from '../src/usage-limit.js';

test('signup copy follows one configured amount without modifying daily check-in rewards',()=>{
 setRegistrationGiftAmount(50);assert.match(tr('login.signupGift',{},'zh'),/50/);assert.match(tr('login.incentive',{},'en'),/50.*10/);
 setRegistrationGiftAmount(75);assert.match(tr('login.signupGift',{},'en'),/75/);assert.match(tr('err.freeQuota',{},'zh'),/75/);
 assert.deepEqual(promotionMessageValues('menu.hintDailyCheckin'),{});
 for(const invalid of [-1,1.5,NaN,'100',2147483648])assert.equal(setRegistrationGiftAmount(invalid),false);
 assert.match(tr('login.signupGift',{},'zh'),/75/);setRegistrationGiftAmount(50);
});
test('gateway cost details survive while missing structured messages use neutral copy',()=>{
 const detail='This request needs 12 coins. You have 9.457191 coins.';
 assert.equal(gatewayLimitMessage('[[gw:insufficient_balance]] '+detail,'fallback'),detail);
 assert.equal(gatewayLimitMessage('[[gw:free_daily_cap_reached]] Today’s free allowance is used up.','fallback'),'Today’s free allowance is used up.');
 assert.equal(gatewayLimitMessage('Error: [[gw:insufficient_balance]] '+detail,'fallback'),detail);
 assert.equal(gatewayLimitMessage('insufficient_balance','This request is not affordable'),'This request is not affordable');
});
