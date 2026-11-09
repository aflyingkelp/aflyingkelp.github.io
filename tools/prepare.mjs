import {buildLocalPackage} from './package-builder.mjs';
const input=document.querySelector('#gameFile'),button=document.querySelector('#buildButton'),status=document.querySelector('#status'),download=document.querySelector('#download');
let previousUrl;
button.addEventListener('click',async()=>{
  const file=input.files[0];
  status.classList.remove('error');download.hidden=true;
  if(!file||file.name.toLowerCase()!=='th10.dat'){status.textContent='Choose the th10.dat file from your Mountain of Faith installation.';return;}
  if(file.size===0||file.size>160*1024*1024){status.textContent='That file is empty or larger than expected. Choose the original th10.dat.';return;}
  button.disabled=true;
  try{
    status.textContent='Preparing your game package locally…';
    const response=await fetch('tools/unifont-16.0.04.otf');if(!response.ok)throw Error('The bundled font could not be loaded. Reload this page and try again.');
    const [data,font]=await Promise.all([file.arrayBuffer(),response.arrayBuffer()]);
    const {archive,descriptor}=await buildLocalPackage({data:new Uint8Array(data),font:new Uint8Array(font),zip:fflate.zipSync});
    if(previousUrl)URL.revokeObjectURL(previousUrl);
    previousUrl=URL.createObjectURL(new Blob([archive],{type:'application/zip'}));
    download.href=previousUrl;download.download=`th10-local-${descriptor.revision}.zip`;download.hidden=false;
    status.textContent='Your ZIP is ready. Download it, then import it in the launcher.';
  }catch(error){status.classList.add('error');status.textContent=error.message||String(error);}finally{button.disabled=false;}
});
