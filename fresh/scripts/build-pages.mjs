import {readFile,mkdir,writeFile} from 'node:fs/promises';
await mkdir('pages',{recursive:true});
let html=await readFile('web/index.html','utf8');html=html.replace('<script src="app.js"></script>','<script src="pages-client.js?v=2"></script><script src="app.js?v=2"></script>');
let app=await readFile('web/app.js','utf8');if(!app.includes("fetch('/api/search?'+params,{signal})"))throw Error('Search integration changed');app=app.replace("fetch('/api/search?'+params,{signal})",'freshPagesSearch(params,signal)');
await Promise.all([writeFile('pages/index.html',html),writeFile('pages/app.js',app),writeFile('pages/style.css',await readFile('web/style.css','utf8')),writeFile('pages/pages-client.js',await readFile('web/pages-client.js','utf8'))]);
console.log('Built zero-setup GitHub Pages frontend. Search uses the public backend; no keys in the browser.');
