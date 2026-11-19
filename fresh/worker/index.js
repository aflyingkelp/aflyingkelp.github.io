const trustedOrigins=new Set(['https://aflyingkelp.github.io','https://fresh-play-okay-x20.a-flying-kelp.chatgpt.site']);
const requestWindows=new Map();
const searchCache=new Map();
function json(body,status=200,headers={}){return Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}})}
function cors(request){const origin=request.headers.get('Origin');return origin&&trustedOrigins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'}:{}}
function withCors(response,headers){const result=new Response(response.body,response);for(const[k,v]of Object.entries(headers))result.headers.set(k,v);return result}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);const isSearch=url.pathname==='/api/search';const origin=request.headers.get('Origin');const headers=cors(request);
 if(isSearch&&origin&&!trustedOrigins.has(origin))return json({error:'This origin is not allowed.'},403);
 if(isSearch&&request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});
 if(isSearch){
  const q=(url.searchParams.get('q')||'').trim();if(!q||q.length>500)return json({error:'Enter a search between 1 and 500 characters.'},400,headers);
  if(!env.YOUTUBE_API_KEY)return json({code:'NOT_CONFIGURED',error:'Search is temporarily unavailable.'},503,headers);
  const pageToken=url.searchParams.get('pageToken')||'';if(pageToken.length>512)return json({error:'Invalid search page. Start a new search.'},400,headers);
  const cacheKey=JSON.stringify([q.toLowerCase(),pageToken]);const hit=searchCache.get(cacheKey);if(hit&&hit.until>Date.now())return json(hit.payload,200,headers);
  const ip=request.headers.get('CF-Connecting-IP');if(ip){const now=Date.now();let bucket=requestWindows.get(ip);if(!bucket||bucket.until<now){bucket={count:0,until:now+600000};requestWindows.set(ip,bucket)}if(++bucket.count>30)return json({error:'Too many searches. Please wait a few minutes and try again.'},429,{...headers,'Retry-After':'600'});if(requestWindows.size>2000)for(const[key,b]of requestWindows)if(b.until<now)requestWindows.delete(key)}
  const api=new URL('https://www.googleapis.com/youtube/v3/search');api.search=new URLSearchParams({part:'snippet',type:'video',q,maxResults:'50',videoEmbeddable:'true',key:env.YOUTUBE_API_KEY,...(pageToken?{pageToken}:{})}).toString();
  try{const r=await fetch(api,{signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok){const quota=data.error?.errors?.some(e=>['quotaExceeded','dailyLimitExceeded'].includes(e.reason));return json({error:quota?'YouTube search quota is used up. Try again later.':'YouTube search is temporarily unavailable. Please try again later.'},r.status===429?429:502,headers)}
   const payload={nextPageToken:data.nextPageToken||null,items:(data.items||[]).filter(v=>/^[\w-]{11}$/.test(v.id?.videoId||'')).map(v=>({id:v.id.videoId,title:v.snippet.title,channel:v.snippet.channelTitle,topic:'YouTube'}))};
   if(searchCache.size>=300)searchCache.delete(searchCache.keys().next().value);searchCache.set(cacheKey,{payload,until:Date.now()+600000});
   return json(payload,200,headers);
  }catch{return json({error:'YouTube search timed out. Please try again.'},504,headers)}
 }
 const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'}})
}};
