const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname, port=8099;
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.json':'application/json','.css':'text/css'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(root,p);
  fs.readFile(fp,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(fp)]||'application/octet-stream'}); res.end(d); });
}).listen(port,'127.0.0.1',()=>console.log('serving '+root+' on http://127.0.0.1:'+port));
