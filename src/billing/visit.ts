export type BillingVisitStage = 'plans' | 'checkout' | 'ledger';
export type BillingSelection = { sku:string; period:string; reason:'default'|'manual'|'period'|'purchase'; at_ms:number };
type Send = (event:string, props:Record<string,unknown>)=>void;

/** Cumulative snapshots survive retries/out-of-order delivery without double-counting. */
export class BillingVisit {
  private last:number;
  private stage:BillingVisitStage='ledger';
  private active=false;
  private plans=0;
  private checkout=0;
  private tabTimes:Record<string,number>={};
  private seq=0;
  private sku='';
  private period='';
  private initial='';
  private switches=0;
  private manualSwitches=0;
  private history:BillingSelection[]=[];
  constructor(private send:Send, private now:()=>number=()=>performance.now()) { this.last=now(); }
  private sample(){
    const now=this.now(),delta=Math.max(0,Math.min(20000,now-this.last));this.last=now;
    // Long gaps (OS sleep / frozen renderer) are never treated as continuous viewing.
    if(this.active){if(this.stage==='plans'){this.plans+=delta;if(this.period)this.tabTimes[this.period]=(this.tabTimes[this.period]??0)+delta;}else if(this.stage==='checkout')this.checkout+=delta;}
  }
  view(stage:BillingVisitStage,active:boolean){this.sample();const changed=this.stage!==stage||this.active!==active;this.stage=stage;this.active=active;if(changed)this.report('view');}
  select(sku:string,period:string,reason:BillingSelection['reason']){
    if(!sku||sku===this.sku&&period===this.period)return;
    this.sample();if(this.initial){this.switches++;if(reason==='manual'||reason==='purchase')this.manualSwitches++;}else this.initial=sku;
    this.sku=sku;this.period=period;
    this.history.push({sku,period,reason:this.history.length?reason:'default',at_ms:Math.round(this.plans+this.checkout)});
    if(this.history.length>40)this.history.splice(1,1);
    this.report('selection');
  }
  report(reason:'view'|'heartbeat'|'selection'|'close'){
    this.sample();this.send('billing_visit_snapshot',{
      report_seq:++this.seq,reason,stage:this.stage,foreground:this.active,
      plans_ms:Math.round(this.plans),checkout_ms:Math.round(this.checkout),tab_times:{...this.tabTimes},
      total_ms:Math.round(this.plans+this.checkout),initial_sku:this.initial,
      selected_sku:this.sku,selected_period:this.period,switch_count:this.switches,manual_switch_count:this.manualSwitches,
      selection_history:this.history.map(x=>({...x})),history_truncated:this.switches+1>this.history.length,
    });
  }
}
