async function tokenHash(token){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function chatMessage(row){return{id:row.id,author:row.author_hash,name:row.name,text:row.body,createdAt:row.created_at,video:row.video_id?{id:row.video_id,title:row.video_title||'Shared video',channel:row.video_channel||'YouTube',topic:'Community'}:null}}
async function socialApi(request,env,url,headers){
 if(!env.DB)return json({error:'Chat is temporarily unavailable. Please try again shortly.'},503,headers);
 try{
 if(request.method==='GET'&&url.pathname==='/api/chat'){const rows=await env.DB.prepare('SELECT m.* FROM chat_messages m WHERE (SELECT COUNT(*) FROM chat_reports r WHERE r.message_id=m.id)<3 ORDER BY m.created_at DESC,m.id DESC LIMIT 80').all();return json({messages:(rows.results||[]).reverse().map(chatMessage)},200,headers)}
 if(request.method!=='POST')return json({error:'Method not allowed.'},405,headers);
 const ip=request.headers.get('CF-Connecting-IP');if(ip){const key='chat:'+ip;const now=Date.now();let window=requestWindows.get(key);if(!window||window.until<now){window={count:0,until:now+60000};requestWindows.set(key,window)}if(++window.count>20)return json({error:'Too many chat actions. Please wait a minute.'},429,headers)}
 if(Number(request.headers.get('Content-Length')||0)>4096)return json({error:'Message is too long.'},413,headers);
 const raw=await request.text();if(raw.length>4096)return json({error:'Message is too long.'},413,headers);let body;try{body=JSON.parse(raw)}catch{return json({error:'Invalid message.'},400,headers)}
 if(!body||typeof body!=='object'||typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'Refresh the page to create your guest identity.'},400,headers);
 const author=await tokenHash(body.token);const now=Date.now();
 if(url.pathname==='/api/chat/delete'){if(typeof body.id!=='string'||body.id.length>64)return json({error:'Invalid message.'},400,headers);const result=await env.DB.prepare('DELETE FROM chat_messages WHERE id=? AND author_hash=?').bind(body.id,author).run();return json({deleted:(result.meta?.changes||0)>0},200,headers)}
 if(url.pathname==='/api/chat/report'){if(typeof body.id!=='string'||body.id.length>64)return json({error:'Invalid message.'},400,headers);const exists=await env.DB.prepare('SELECT id FROM chat_messages WHERE id=?').bind(body.id).first();if(!exists)return json({error:'Message no longer exists.'},404,headers);await env.DB.prepare('INSERT OR IGNORE INTO chat_reports (message_id,reporter_hash,created_at) VALUES (?,?,?)').bind(body.id,author,now).run();return json({reported:true},200,headers)}
 if(url.pathname!=='/api/chat')return json({error:'Not found.'},404,headers);
 const name=typeof body.name==='string'?body.name.trim():'';const text=typeof body.text==='string'?body.text.trim():'';
 if(!name||name.length>24||text.length>400)return json({error:'Use a name up to 24 characters and a message up to 400 characters.'},400,headers);
 let video=null;if(body.video!=null){if(typeof body.video.id!=='string'||!/^[\w-]{11}$/.test(body.video.id))return json({error:'Use a valid YouTube video link.'},400,headers);video={id:body.video.id,title:String(body.video.title||'Shared video').slice(0,160),channel:String(body.video.channel||'YouTube').slice(0,80)}}
 if(!text&&!video)return json({error:'Write a message or attach a video.'},400,headers);
 const recent=await env.DB.prepare('SELECT COUNT(*) AS total,MAX(created_at) AS latest FROM chat_messages WHERE author_hash=? AND created_at>?').bind(author,now-60000).first();if(recent&&(recent.total>=6||recent.latest>now-2000))return json({error:'Please wait a moment before sending another message.'},429,headers);
 const row={id:crypto.randomUUID(),author_hash:author,name,body:text,video_id:video?.id||null,video_title:video?.title||null,video_channel:video?.channel||null,created_at:now};
 await env.DB.prepare('INSERT INTO chat_messages (id,author_hash,name,body,video_id,video_title,video_channel,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(row.id,author,name,text,row.video_id,row.video_title,row.video_channel,now).run();return json({message:chatMessage(row)},201,headers);
 }catch{return json({error:'Chat could not connect. Please try again.'},503,headers)}
}
function durationSeconds(value){const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value||'');return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):Infinity}
