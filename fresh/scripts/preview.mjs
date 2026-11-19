import http from 'node:http';import{readFile}from'node:fs/promises';
const{default:worker}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('dist/server/index.js','utf8')).toString('base64'));
http.createServer(async(req,res)=>{try{const r=await worker.fetch(new Request('http://127.0.0.1:4173'+req.url,{method:req.method}),{});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()))}catch{res.writeHead(500);res.end('Preview error')}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
