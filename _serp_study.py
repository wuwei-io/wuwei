# -*- coding: utf-8 -*-
import io,sys,json,time,urllib.request,urllib.parse
if getattr(sys.stdout,"encoding","").lower()!="utf-8":
    sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding="utf-8")
import websocket
PORT=9222
def pages():
    return [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t.get("type")=="page"]
def find_tab(sub):
    for p in pages():
        if sub in p.get("url","") or sub in p.get("title",""):
            return p
    return None
class Tab:
    def __init__(s,p):
        s.ws=websocket.create_connection(p["webSocketDebuggerUrl"],timeout=25);s.i=0
    def cmd(s,m,pa=None,to=25):
        s.i+=1;_id=s.i;s.ws.send(json.dumps({"id":_id,"method":m,"params":pa or {}}))
        end=time.time()+to
        while time.time()<end:
            msg=json.loads(s.ws.recv())
            if msg.get("id")==_id:return msg.get("result",{})
        raise TimeoutError(m)
    def ev(s,e):
        r=s.cmd("Runtime.evaluate",{"expression":e,"returnByValue":True,"awaitPromise":True})
        return r.get("result",{}).get("value")
    def close(s):
        try:s.ws.close()
        except:pass

EXTRACT=r"""(function(){
  var out=[];
  document.querySelectorAll('a h3').forEach(function(h){
    var a=h.closest('a');var link=a?a.href:'';
    if(!link||link.indexOf('google.')>=0)return;
    var block=h.closest('div[data-hveid]')||a.parentElement.parentElement;
    var snip='';var cands=block?block.querySelectorAll('div'):[];
    for(var i=0;i<cands.length;i++){var tx=cands[i].innerText||'';if(tx.length>40&&tx.length<400&&cands[i].querySelectorAll('h3').length===0){snip=tx.replace(/\nRead more/,'');break}}
    var dom=(link.match(/https?:\/\/([^\/]+)/)||['',''])[1];
    out.push('['+dom+'] '+h.innerText+(snip?' → '+snip.slice(0,150):''));
  });
  var seen={},u=[];out.forEach(function(x){var k=x.slice(0,45);if(!seen[k]){seen[k]=1;u.push(x)}});
  return u.slice(0,7).join('\n');
})()"""

words=sys.argv[1:] if len(sys.argv)>1 else []
tab_meta=find_tab("google.com/search")
if not tab_meta:
    print("没找到google搜索标签");sys.exit(1)
t=Tab(tab_meta)
for w in words:
    url="https://www.google.com/search?q="+urllib.parse.quote(w)+"&hl=en&gl=us&num=10"
    t.cmd("Page.enable");t.cmd("Page.navigate",{"url":url});time.sleep(4.5)
    res=t.ev(EXTRACT)
    print("\n===== 【"+w+"】 =====")
    print(res or "(无结果)")
t.close()
