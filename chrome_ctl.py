# -*- coding: utf-8 -*-
"""
chrome_ctl.py —— 通过 CDP 操控已开调试模式(--remote-debugging-port=9222)的本机 Chrome。
带登录态，能读页面/导航/点击/填表/跑JS/开关标签页。

用法示例:
  python chrome_ctl.py list
  python chrome_ctl.py read 2                 # 读第2个标签页正文
  python chrome_ctl.py read https://x.com      # 也可按URL片段匹配标签页
  python chrome_ctl.py goto https://a.com 0    # 让第0个标签页导航
  python chrome_ctl.py click "button.submit" 0
  python chrome_ctl.py fill "input#q" "你好" 0
  python chrome_ctl.py js "document.title" 0
  python chrome_ctl.py newtab https://a.com
  python chrome_ctl.py activate 3
  python chrome_ctl.py title 0

标签定位(target): 可传整数下标，或URL/标题的一段文字(模糊匹配)，默认第0个。
"""
import io, sys, json, time, urllib.request
if getattr(sys.stdout, "encoding", "").lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import websocket  # pip install websocket-client

PORT = 9222
BASE = f"http://127.0.0.1:{PORT}"


def _get(path):
    return json.load(urllib.request.urlopen(BASE + path, timeout=8))


def list_pages():
    return [t for t in _get("/json") if t.get("type") == "page"]


def pick(target):
    """target: None/整数/字符串片段 -> 返回一个 page 对象"""
    pages = list_pages()
    if not pages:
        raise RuntimeError("没有可用页面标签")
    if target is None:
        return pages[0]
    # 纯数字 -> 下标
    if isinstance(target, int) or (isinstance(target, str) and target.lstrip("-").isdigit()):
        return pages[int(target)]
    # 字符串 -> 在 url/title 里模糊匹配
    t = str(target).lower()
    for p in pages:
        if t in p.get("url", "").lower() or t in p.get("title", "").lower():
            return p
    raise RuntimeError(f"没有标签匹配 '{target}'")


class Tab:
    def __init__(self, page):
        self.page = page
        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=20)
        self._id = 0

    def cmd(self, method, params=None, timeout=20):
        self._id += 1
        _id = self._id
        self.ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == _id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})
        raise TimeoutError(method)

    def eval(self, expr, by_value=True, await_promise=False):
        r = self.cmd("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": by_value,
            "awaitPromise": await_promise,
        })
        res = r.get("result", {})
        if res.get("subtype") == "error":
            return "[JS错误] " + res.get("description", "")
        return res.get("value")

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


# ---------- 各命令 ----------
def cmd_list(_args):
    pages = list_pages()
    print(f"共 {len(pages)} 个页面标签:")
    for i, p in enumerate(pages):
        print(f"[{i}] {p.get('title','')[:60]}")
        print(f"    {p.get('url','')[:100]}")


def cmd_read(args):
    tab = Tab(pick(args[0] if args else None))
    try:
        n = int(args[1]) if len(args) > 1 else 3000
        title = tab.eval("document.title")
        url = tab.eval("location.href")
        body = tab.eval(f"document.body ? document.body.innerText.slice(0,{n}) : ''")
        print(f"[标题] {title}\n[URL ] {url}\n{'='*40}\n{body}")
    finally:
        tab.close()


def cmd_html(args):
    tab = Tab(pick(args[0] if args else None))
    try:
        sel = args[1] if len(args) > 1 else None
        if sel:
            js = f"(document.querySelector({json.dumps(sel)})||{{}}).outerHTML || '[未找到]'"
        else:
            js = "document.documentElement.outerHTML.slice(0,6000)"
        print(tab.eval(js))
    finally:
        tab.close()


def cmd_goto(args):
    url = args[0]
    tab = Tab(pick(args[1] if len(args) > 1 else None))
    try:
        tab.cmd("Page.enable")
        tab.cmd("Page.navigate", {"url": url})
        time.sleep(2)
        print(f"[已导航] {tab.eval('location.href')}  | {tab.eval('document.title')}")
    finally:
        tab.close()


def cmd_click(args):
    sel = args[0]
    tab = Tab(pick(args[1] if len(args) > 1 else None))
    try:
        js = f"""(function(){{
            var el=document.querySelector({json.dumps(sel)});
            if(!el) return '[未找到] '+{json.dumps(sel)};
            el.scrollIntoView({{block:'center'}}); el.click();
            return '[已点击] '+(el.innerText||el.value||el.tagName).slice(0,40);
        }})()"""
        print(tab.eval(js))
    finally:
        tab.close()


def cmd_fill(args):
    sel, text = args[0], args[1]
    tab = Tab(pick(args[2] if len(args) > 2 else None))
    try:
        js = f"""(function(){{
            var el=document.querySelector({json.dumps(sel)});
            if(!el) return '[未找到] '+{json.dumps(sel)};
            el.focus(); el.value={json.dumps(text)};
            el.dispatchEvent(new Event('input',{{bubbles:true}}));
            el.dispatchEvent(new Event('change',{{bubbles:true}}));
            return '[已填入] '+{json.dumps(text)};
        }})()"""
        print(tab.eval(js))
    finally:
        tab.close()


def cmd_js(args):
    expr = args[0]
    tab = Tab(pick(args[1] if len(args) > 1 else None))
    try:
        val = tab.eval(expr, await_promise=True)
        print(json.dumps(val, ensure_ascii=False, indent=2) if isinstance(val, (dict, list)) else val)
    finally:
        tab.close()


def cmd_mouse(args):
    """按选择器找元素，用CDP真实鼠标事件点击(比JS click更能触发Material组件)。
    用法: mouse "<selector>" [目标]  或  mousetext "<可见文字>" [目标]"""
    sel = args[0]
    tab = Tab(pick(args[1] if len(args) > 1 else None))
    try:
        # 拿到元素中心坐标
        js = f"""(function(){{
            var els=Array.from(document.querySelectorAll('*')).filter(function(e){{
                return (e.innerText||'').trim()==={json.dumps(sel)} && e.getBoundingClientRect().width>3;
            }});
            if(!els.length) return null;
            var r=els[0].getBoundingClientRect();
            return JSON.stringify({{x:r.x+r.width/2, y:r.y+r.height/2}});
        }})()"""
        coord = tab.eval(js)
        if not coord:
            print("[未找到可见元素] " + sel)
            return
        c = json.loads(coord)
        x, y = c["x"], c["y"]
        for t in ("mousePressed", "mouseReleased"):
            tab.cmd("Input.dispatchMouseEvent", {
                "type": t, "x": x, "y": y, "button": "left", "clickCount": 1
            })
            time.sleep(0.05)
        print(f"[真实点击] {sel} @ ({int(x)},{int(y)})")
    finally:
        tab.close()


def cmd_title(args):
    tab = Tab(pick(args[0] if args else None))
    try:
        print(tab.eval("document.title") + "  |  " + tab.eval("location.href"))
    finally:
        tab.close()


def cmd_newtab(args):
    url = args[0] if args else "about:blank"
    urllib.request.urlopen(BASE + f"/json/new?{url}", timeout=8)  # 老接口
    print(f"[已新开] {url}")


def cmd_activate(args):
    p = pick(args[0] if args else None)
    urllib.request.urlopen(BASE + f"/json/activate/{p['id']}", timeout=8)
    print(f"[已切到] {p.get('title','')}")


CMDS = {
    "list": cmd_list, "read": cmd_read, "html": cmd_html, "goto": cmd_goto,
    "click": cmd_click, "fill": cmd_fill, "js": cmd_js, "title": cmd_title,
    "newtab": cmd_newtab, "activate": cmd_activate, "mouse": cmd_mouse,
}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        print(__doc__)
        sys.exit(0)
    CMDS[sys.argv[1]](sys.argv[2:])
