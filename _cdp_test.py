# -*- coding: utf-8 -*-
import io, json, sys, urllib.request
if getattr(sys.stdout, "encoding", "").lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import websocket  # websocket-client

PORT = 9222

def list_pages():
    data = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json"))
    return [t for t in data if t.get("type") == "page"]

def cmd(ws, _id, method, params=None):
    ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get("id") == _id:
            return msg

def read_page(target_index):
    pages = list_pages()
    t = pages[target_index]
    print(f"[目标] {t.get('title','')}")
    print(f"[URL ] {t.get('url','')}")
    ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=15)
    try:
        cmd(ws, 1, "Runtime.enable")
        expr = "document.title + '\\n----\\n' + (document.body ? document.body.innerText.slice(0,600) : '')"
        r = cmd(ws, 2, "Runtime.evaluate",
                {"expression": expr, "returnByValue": True})
        val = r.get("result", {}).get("result", {}).get("value", "")
        print("=== 页面正文(前600字) ===")
        print(val)
    finally:
        ws.close()

if __name__ == "__main__":
    idx = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    read_page(idx)
