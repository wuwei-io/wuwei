# -*- coding: utf-8 -*-
"""
轻量 CDP 控制器：连接调试模式 Chrome(9222)，读页面/滚动/点击/执行JS。
用法示例：
  python cdp.py tabs                # 列出所有标签页
  python cdp.py read                # 读当前活动标签页正文
  python cdp.py read <索引或url关键词>
  python cdp.py scroll 1000         # 向下滚动 1000 像素
  python cdp.py js "document.title" # 执行任意 JS 取返回值
  python cdp.py click "a.title"     # 点击第一个匹配 CSS 的元素
  python cdp.py links               # 列出页面所有链接(文字+URL)
"""
import sys, json, time, io
import requests
from websocket import create_connection

# 强制 UTF-8 输出，避免 Windows GBK 控制台崩
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

CDP = "http://127.0.0.1:9222"

def list_tabs():
    r = requests.get(f"{CDP}/json", timeout=5).json()
    pages = [t for t in r if t.get("type") == "page"]
    # 优先展示真正的 http(s) 网页，扩展页/内置页排后面
    def rank(t):
        u = t.get("url", "")
        if u.startswith("http") and "accounts.google.com" not in u:
            return 0
        if u.startswith("http"):
            return 1
        if u.startswith("chrome-extension"):
            return 3
        return 2
    return sorted(pages, key=rank)

def pick_tab(sel=None):
    tabs = list_tabs()
    if not tabs:
        raise RuntimeError("没有可用标签页，确认已用 start_chrome.bat 启动 Chrome")
    if sel is None:
        return tabs[0]
    # 索引
    if sel.isdigit() and int(sel) < len(tabs):
        return tabs[int(sel)]
    # url/title 关键词
    for t in tabs:
        if sel.lower() in (t.get("url","")+t.get("title","")).lower():
            return t
    return tabs[0]

_id = [0]
def send(ws, method, params=None):
    _id[0] += 1
    ws.send(json.dumps({"id": _id[0], "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == _id[0]:
            return msg

def evaluate(tab, expr, await_promise=False):
    ws = create_connection(tab["webSocketDebuggerUrl"], timeout=15)
    try:
        send(ws, "Runtime.enable")
        r = send(ws, "Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": await_promise,
        })
        res = r.get("result", {}).get("result", {})
        return res.get("value")
    finally:
        ws.close()

def cmd_tabs():
    for i, t in enumerate(list_tabs()):
        print(f"[{i}] {t.get('title','')[:60]}  ->  {t.get('url','')}")

def cmd_read(sel=None):
    tab = pick_tab(sel)
    print(f"# {tab.get('title','')}\n# {tab.get('url','')}\n")
    txt = evaluate(tab, "document.body.innerText")
    print(txt or "(空)")

def cmd_scroll(px, sel=None):
    tab = pick_tab(sel)
    evaluate(tab, f"window.scrollBy(0,{int(px)});")
    print(f"已滚动 {px}px")

def cmd_js(expr, sel=None):
    tab = pick_tab(sel)
    print(evaluate(tab, expr))

def cmd_click(css, sel=None):
    tab = pick_tab(sel)
    ok = evaluate(tab, f"(()=>{{const e=document.querySelector({json.dumps(css)});if(e){{e.click();return true}}return false}})()")
    print("已点击" if ok else "未找到元素: "+css)

def cmd_find(kw, sel=None):
    """在当前页找含关键词的评论/帖子链接，打印 URL"""
    tab = pick_tab(sel)
    expr = ('JSON.stringify([...document.querySelectorAll("a[href*=comments]")]'
            '.map(a=>({t:a.innerText.trim(),h:a.href})).filter(x=>x.t))')
    data = json.loads(evaluate(tab, expr) or "[]")
    kwl = kw.lower()
    for x in data:
        if kwl in x["t"].lower():
            print(x["h"], "  <<", x["t"][:60])

def cmd_open(url, sel=None):
    tab = pick_tab(sel)
    evaluate(tab, f"location.href={json.dumps(url)}")
    print("navigating:", url)

def cmd_comments(sel=None):
    """读当前帖子页的正文+评论"""
    tab = pick_tab(sel)
    print(f"# {tab.get('title','')}\n# {tab.get('url','')}\n")
    expr = ('JSON.stringify([...document.querySelectorAll("shreddit-comment, [id^=t1_], .Comment, p")]'
            '.map(e=>e.innerText.trim()).filter(t=>t.length>15))')
    data = json.loads(evaluate(tab, expr) or "[]")
    seen=set(); out=[]
    for t in data:
        if t not in seen:
            seen.add(t); out.append(t)
    for t in out[:40]:
        print("-", t[:300])

def cmd_links(sel=None):
    tab = pick_tab(sel)
    data = evaluate(tab, "JSON.stringify([...document.querySelectorAll('a')].map(a=>({t:a.innerText.trim(),h:a.href})).filter(x=>x.t))")
    for x in json.loads(data or "[]"):
        print(f"{x['t'][:60]}  ->  {x['h']}")

if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit()
    c = a[0]
    try:
        if c=="tabs": cmd_tabs()
        elif c=="read": cmd_read(a[1] if len(a)>1 else None)
        elif c=="scroll": cmd_scroll(a[1], a[2] if len(a)>2 else None)
        elif c=="js": cmd_js(a[1], a[2] if len(a)>2 else None)
        elif c=="click": cmd_click(a[1], a[2] if len(a)>2 else None)
        elif c=="links": cmd_links(a[1] if len(a)>1 else None)
        elif c=="find": cmd_find(a[1], a[2] if len(a)>2 else None)
        elif c=="open": cmd_open(a[1])
        elif c=="comments": cmd_comments()
        else: print("未知命令:",c); print(__doc__)
    except requests.exceptions.ConnectionError:
        print("连不上 9222。请先运行 start_chrome.bat 以调试模式启动 Chrome。")
