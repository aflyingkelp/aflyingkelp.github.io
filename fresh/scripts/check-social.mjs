import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';import{localDb}from'./local-db.mjs';
const{default:worker}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('dist/server/index.js','utf8')).toString('base64'));
const{db,binding}=localDb();const env={DB:binding};const token='a'.repeat(64),other='b'.repeat(64);const call=(path,body)=>worker.fetch(new Request('https://fresh.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://aflyingkelp.github.io',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
assert.equal((await(await call('/api/chat')).json()).messages.length,0);
let r=await call('/api/chat',{token,name:'Test guest',text:'Local preview message',video:{id:'aircAruvnKk',title:'A video',channel:'Test channel'}});assert.equal(r.status,201);const message=(await r.json()).message;assert.equal(message.video.id,'aircAruvnKk');assert.equal(JSON.stringify(message).includes(token),false);
const secondClient=(await(await call('/api/chat')).json()).messages;assert.equal(secondClient.length,1);assert.equal(secondClient[0].text,'Local preview message');
assert.equal((await call('/api/chat',{token,name:'Test guest',text:'too fast'})).status,429);
assert.equal((await call('/api/chat',{token:other,name:'Other guest',text:'',video:{id:'not-valid'}})).status,400);
assert.equal((await call('/api/chat',{token:other,name:'Other guest',text:'x'.repeat(401)})).status,400);
assert.equal((await(await call('/api/chat/delete',{token:other,id:message.id})).json()).deleted,false);
for(const reporter of ['b','c','d'])assert.equal((await call('/api/chat/report',{token:reporter.repeat(64),id:message.id})).status,200);
assert.equal((await(await call('/api/chat')).json()).messages.length,0);assert.equal((await(await call('/api/chat/delete',{token,id:message.id})).json()).deleted,true);
// Shorts must request short-form search and exclude videos longer than three minutes.
const originalFetch=globalThis.fetch;try{globalThis.fetch=async input=>{const u=new URL(input);if(u.pathname.endsWith('/search')){assert.equal(u.searchParams.get('videoDuration'),'short');assert.match(u.searchParams.get('q'),/#shorts/);return Response.json({items:[{id:{videoId:'aircAruvnKk'},snippet:{title:'Short',channelTitle:'A'}},{id:{videoId:'XkM_04Ch76E'},snippet:{title:'Long',channelTitle:'B'}}]})}return Response.json({items:[{id:'aircAruvnKk',contentDetails:{duration:'PT45S'}},{id:'XkM_04Ch76E',contentDetails:{duration:'PT4M'}}]})};const shorts=await worker.fetch(new Request('https://fresh.test/api/shorts?q=science'),{YOUTUBE_API_KEY:'test-only'});assert.deepEqual((await shorts.json()).items.map(v=>v.id),['aircAruvnKk'])}finally{globalThis.fetch=originalFetch}
db.close();console.log('Passed: shared chat reads, video attachments, rate limits, validation, ownership, reports, Shorts duration filtering');
