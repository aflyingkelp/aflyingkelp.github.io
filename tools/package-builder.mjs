const DATA_LAYOUT='sha256-6b25b2ce0bf32d56880d32b4a0d26541eae670ee31e4de7126fcfd4d95f446a7';
const encoder=new TextEncoder();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
export async function buildLocalPackage({data,font,zip,crypto=globalThis.crypto}) {
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const dataHash=await hash(data),fontHash=await hash(font);
  const declare=(source,target,bytes,sha256)=>({source,target,bytes,sha256,revision:sha256.slice(0,16)});
  const descriptor={schema:'eagler-touhou/package/1',game:'th10',revision:'pending',runtimeRequirement:{protocol:'eagler-touhou/1',target:'th10',dataFile:'game-data',dataLayout:DATA_LAYOUT},files:{'game-data':declare('games/th10/th10.data','/th10.data',data.length,dataHash),'shared-msgothic':declare('shared/unifont.otf','/msgothic.ttc',font.length,fontHash),'shared-unifont':declare('shared/unifont.otf','/unifont.otf',font.length,fontHash)},base:{files:['game-data','shared-msgothic','shared-unifont']},components:{}};
  const payload={...descriptor};delete payload.revision;
  descriptor.revision=(await hash(encoder.encode(JSON.stringify(canonical(payload))))).slice(0,16);
  const archive=zip({'package.json':encoder.encode(JSON.stringify(descriptor,null,2)+'\n'),'games/th10/th10.data':data,'shared/unifont.otf':font},{level:0});
  return {descriptor,archive};
}
