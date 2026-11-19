let freshPagesKey='';try{freshPagesKey=sessionStorage.getItem('fresh-youtube-api-key')||''}catch{}
const connectDialog=document.querySelector('#connect-dialog');const connectButton=document.querySelector('#connect-search');
function updateConnection(){connectButton.textContent=freshPagesKey?'Search connected':'Connect search'}
connectButton.onclick=()=>{document.querySelector('#youtube-key').value='';document.querySelector('#key-message').textContent=freshPagesKey?'A key is connected for this tab. Paste another to replace it.':'';connectDialog.showModal()};
document.querySelector('#close-connect').onclick=()=>connectDialog.close();
document.querySelector('#connect-form').onsubmit=e=>{e.preventDefault();const input=document.querySelector('#youtube-key');const key=input.value.trim();if(!key)return;freshPagesKey=key;try{sessionStorage.setItem('fresh-youtube-api-key',key)}catch{}input.value='';connectDialog.close();updateConnection();window.dispatchEvent(new Event('fresh-key-connected'))};
document.querySelector('#forget-key').onclick=()=>{freshPagesKey='';try{sessionStorage.removeItem('fresh-youtube-api-key')}catch{}document.querySelector('#youtube-key').value='';document.querySelector('#key-message').textContent='Disconnected. The key was removed from this tab.';updateConnection()};
updateConnection();
async function freshPagesSearch(params,signal){
 if(!freshPagesKey){connectButton.click();return Response.json({code:'KEY_REQUIRED',error:'Connect your YouTube API key using Connect search to see live results.'},{status:503})}
 const query=new URLSearchParams({part:'snippet',type:'video',maxResults:'50',videoEmbeddable:'true',q:params.get('q')||'',key:freshPagesKey});if(params.get('pageToken'))query.set('pageToken',params.get('pageToken'));
 const r=await fetch('https://www.googleapis.com/youtube/v3/search?'+query,{signal});const data=await r.json();if(!r.ok){const reasons=(data.error?.errors||[]).map(e=>e.reason);const quota=reasons.some(r=>['quotaExceeded','dailyLimitExceeded'].includes(r));const error=quota?'Your YouTube search quota is used up. Try again later.':'Google rejected the search key. Check YouTube Data API v3 is enabled and the key allows this website.';return Response.json({error},{status:r.status})}
 return Response.json({nextPageToken:data.nextPageToken||null,items:(data.items||[]).filter(v=>/^[\w-]{11}$/.test(v.id?.videoId||'')).map(v=>({id:v.id.videoId,title:v.snippet.title,channel:v.snippet.channelTitle,topic:'YouTube'}))});
}
