// Search credentials live only on the backend, never in this public frontend.
async function freshPagesSearch(params,signal){return fetch('https://fresh-play-okay-x20.a-flying-kelp.chatgpt.site/api/search?'+params,{signal,mode:'cors',credentials:'omit'})}
