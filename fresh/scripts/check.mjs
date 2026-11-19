import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(await readFile('dist/server/index.js','utf8')).toString('base64'));
const req=path=>new Request('https://fresh.test'+path);
assert.equal((await worker.fetch(req('/'),{})).status,200);
assert.equal((await worker.fetch(req('/missing'),{})).status,404);
assert.equal((await worker.fetch(req('/api/search?q='),{})).status,400);
const unavailable=await worker.fetch(req('/api/search?q=science'),{});assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).code,'NOT_CONFIGURED');
const realFetch=globalThis.fetch;
try{globalThis.fetch=async input=>{const u=new URL(input);assert.equal(u.hostname,'www.googleapis.com');assert.equal(u.searchParams.get('q'),'cats & dogs');assert.equal(u.searchParams.get('videoEmbeddable'),'true');return Response.json({items:[{id:{videoId:'aircAruvnKk'},snippet:{title:'A title',channelTitle:'Channel'}},{id:{videoId:'bad'},snippet:{}}]})};const r=await worker.fetch(req('/api/search?q=cats%20%26%20dogs'),{YOUTUBE_API_KEY:'test-only'});assert.deepEqual((await r.json()).items,[{id:'aircAruvnKk',title:'A title',channel:'Channel',topic:'YouTube'}]);globalThis.fetch=async()=>Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403});assert.match((await(await worker.fetch(req('/api/search?q=test'),{YOUTUBE_API_KEY:'test-only'})).json()).error,/quota/)}finally{globalThis.fetch=realFetch}
console.log('Passed: assets, validation, missing configuration, search mapping, embed filtering, quota errors');
const client=await readFile('web/app.js','utf8');const parseVideo=new Function(client.slice(client.indexOf('function videoId('),client.indexOf('function play('))+';return videoId')();assert.equal(parseVideo('programming'),null);assert.equal(parseVideo('https://youtu.be/aircAruvnKk'),'aircAruvnKk');assert.equal(parseVideo('https://example.com/watch?v=aircAruvnKk'),null);
try{globalThis.fetch=async input=>{const u=new URL(input);assert.equal(u.searchParams.get('maxResults'),'50');assert.equal(u.searchParams.get('pageToken'),'page-2');return Response.json({items:[],nextPageToken:'page-3'})};const r=await worker.fetch(req('/api/search?q=test&pageToken=page-2'),{YOUTUBE_API_KEY:'test-only'});assert.equal((await r.json()).nextPageToken,'page-3')}finally{globalThis.fetch=realFetch}
console.log('Passed: pagination, 50-result batches, ordinary 11-character searches, video URL parsing');
