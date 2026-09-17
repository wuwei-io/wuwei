# -*- coding: utf-8 -*-
"""滚动采集当前 Reddit 版块的帖子标题(去重)。用法: python collect.py <滚动次数> <输出文件>"""
import sys, json, time, io
import requests
from websocket import create_connection
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception: pass

CDP="http://127.0.0.1:9222"
def page_tab():
    for t in requests.get(f"{CDP}/json",timeout=5).json():
        u=t.get("url","")
        if t.get("type")=="page" and u.startswith("http") and "accounts.google" not in u:
            return t
    raise RuntimeError("no page tab")

_id=[0]
def ev(ws,method,params=None):
    _id[0]+=1
    ws.send(json.dumps({"id":_id[0],"method":method,"params":params or {}}))
    while True:
        m=json.loads(ws.recv())
        if m.get("id")==_id[0]: return m

def evaluate(tab,expr):
    ws=create_connection(tab["webSocketDebuggerUrl"],timeout=20)
    try:
        ev(ws,"Runtime.enable")
        r=ev(ws,"Runtime.evaluate",{"expression":expr,"returnByValue":True,"awaitPromise":True})
        return r.get("result",{}).get("result",{}).get("value")
    finally: ws.close()

JS_GRAB = r'''JSON.stringify([...document.querySelectorAll('article')].map(a=>{
  var t=a.querySelector('a[href*="/comments/"]');
  return t? t.innerText.trim() : '';
}).filter(x=>x.length>5))'''

def main():
    n=int(sys.argv[1]) if len(sys.argv)>1 else 12
    out=sys.argv[2] if len(sys.argv)>2 else None
    tab=page_tab()
    seen={}
    for i in range(n):
        try:
            arr=json.loads(evaluate(tab, JS_GRAB) or "[]")
        except Exception as e:
            arr=[]
        for t in arr:
            seen.setdefault(t, True)
        evaluate(tab, "window.scrollBy(0, 1600)")
        time.sleep(1.5)
    titles=list(seen.keys())
    print(f"# {tab.get('url')}  共 {len(titles)} 条")
    for t in titles: print(t)
    if out:
        with open(out,"w",encoding="utf-8") as f:
            f.write("\n".join(titles))
        print(f"\n已保存 {len(titles)} 条到 {out}")

if __name__=="__main__": main()
