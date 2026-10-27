import test from 'node:test';
import assert from 'node:assert/strict';
import {BillingVisit} from '../src/billing/visit.js';
test('billing visit counts visible plans and checkout separately, excludes background and ledger',()=>{
 let t=0;const rows:Record<string,unknown>[]=[];const v=new BillingVisit((_e,p)=>rows.push(p),()=>t);
 v.view('plans',true);v.select('mini','monthly','default');t=5000;v.view('plans',false);
 t=65000;v.view('checkout',true);t=68000;v.view('ledger',true);t=73000;v.report('close');
 const p=rows.at(-1)!;assert.equal(p.plans_ms,5000);assert.equal(p.checkout_ms,3000);assert.equal(p.total_ms,8000);
});
test('selection history records real changes, distinguishes automatic period defaults, snapshots are cumulative',()=>{
 let t=0;const rows:Record<string,unknown>[]=[];const v=new BillingVisit((_e,p)=>rows.push(p),()=>t);
 v.view('plans',true);v.select('mini','monthly','default');v.select('mini','monthly','manual');
 t=1000;v.select('pro','monthly','manual');v.select('pro_annual','annual','period');v.report('heartbeat');
 const p=rows.at(-1)!;assert.equal(p.switch_count,2);assert.equal(p.initial_sku,'mini');assert.equal(p.selected_sku,'pro_annual');
 assert.deepEqual((p.selection_history as {reason:string}[]).map(x=>x.reason),['default','manual','period']);
 assert.equal(p.total_ms,1000);assert.ok(Number(p.report_seq)>1);
 t=1000000;v.report('close');assert.equal(rows.at(-1)!.total_ms,21000);
});
