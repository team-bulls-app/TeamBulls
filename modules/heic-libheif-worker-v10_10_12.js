/* Team Bulls v10.10.12 — worker dedicado para decodificar HEIC/HEIF fora da CSP da página. */
'use strict';

const LIBHEIF_URL='https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif/libheif.js';
const LIBHEIF_FALLBACK_URL='https://cdn.jsdelivr.net/npm/libheif-js@1.19.8/libheif-wasm/libheif-bundle.js';
const MAX_PIXELS=32000000;
let ready=false;
let initError='';
let HEIF=null;

function fail(message){initError=String(message||'Falha ao inicializar o decoder HEIC.');}
function libheifCandidates(){
  const candidates=[];
  try{if(typeof libheif!=='undefined')candidates.push(libheif);}catch(error){}
  try{if(self.libheif)candidates.push(self.libheif);}catch(error){}
  try{if(self.module?.exports)candidates.push(self.module.exports);}catch(error){}
  try{if(self.exports)candidates.push(self.exports);}catch(error){}
  return candidates;
}
function resolveLibheif(){
  for(const candidate of libheifCandidates()){
    if(candidate&&typeof candidate.HeifDecoder==='function')return candidate;
    if(candidate?.default&&typeof candidate.default.HeifDecoder==='function')return candidate.default;
  }
  return null;
}
async function waitForLibheif(milliseconds){
  const deadline=Date.now()+milliseconds,attempted=new Set();
  while(Date.now()<deadline){
    const available=resolveLibheif();if(available)return available;
    for(const candidate of libheifCandidates()){
      if(typeof candidate!=='function'||attempted.has(candidate))continue;
      attempted.add(candidate);
      try{
        const factory=Promise.resolve(candidate()).then(loaded=>{if(loaded&&typeof loaded.HeifDecoder==='function')self.libheif=loaded;return loaded;});
        const loaded=await Promise.race([factory,new Promise(resolve=>setTimeout(()=>resolve(null),1500))]);
        if(loaded&&typeof loaded.HeifDecoder==='function')return loaded;
        if(loaded?.default&&typeof loaded.default.HeifDecoder==='function')return loaded.default;
      }catch(error){}
    }
    await new Promise(resolve=>setTimeout(resolve,75));
  }
  return resolveLibheif();
}
async function initializeDecoder(){
  try{
    try{importScripts(LIBHEIF_URL);HEIF=await waitForLibheif(8000);}catch(error){HEIF=null;}
    if(!HEIF){
      importScripts(LIBHEIF_FALLBACK_URL);
      HEIF=await waitForLibheif(8000);
    }
    ready=!!(HEIF&&typeof HEIF.HeifDecoder==='function');
    if(ready){try{self.libheif=HEIF;}catch(error){}}
    else fail('O decoder HEIC não ficou disponível. Escolha fotos JPG/JPEG ou tente novamente com o aplicativo atualizado.');
  }catch(error){fail(error?.message||'Não foi possível carregar o decoder HEIC.');}
  self.postMessage({type:'ready',ok:ready,error:initError});
}
void initializeDecoder();

self.addEventListener('message',event=>{
  const id=String(event.data?.id||'');
  if(!id)return;
  if(!ready||!HEIF){self.postMessage({id,ok:false,error:initError||'Decoder HEIC indisponível.'});return;}
  try{
    const buffer=event.data?.buffer;
    if(!(buffer instanceof ArrayBuffer)||!buffer.byteLength)throw new Error('Arquivo HEIC vazio ou inválido.');
    // Mantém a referência global compatível com instalações/testes antigos, mas usa o objeto efetivamente resolvido.
    const decoder=(self.libheif&&typeof self.libheif.HeifDecoder==='function')?new self.libheif.HeifDecoder():new HEIF.HeifDecoder();
    const images=decoder.decode(new Uint8Array(buffer));
    const image=Array.isArray(images)?images[0]:null;
    if(!image)throw new Error('O arquivo HEIC não contém uma imagem decodificável.');
    const width=Number(image.get_width?.()||0),height=Number(image.get_height?.()||0);
    if(!width||!height)throw new Error('Dimensões HEIC inválidas.');
    if(width*height>MAX_PIXELS)throw new Error('A foto HEIC é grande demais para conversão segura neste aparelho.');
    const rgba=new Uint8ClampedArray(width*height*4);
    const target={data:rgba,width,height};
    image.display(target,displayData=>{
      try{
        if(!displayData)throw new Error('O decoder HEIC não conseguiu renderizar a imagem.');
        const data=displayData.data instanceof Uint8ClampedArray?displayData.data:rgba;
        self.postMessage({id,ok:true,width,height,rgba:data.buffer},[data.buffer]);
      }catch(error){self.postMessage({id,ok:false,error:error?.message||'Falha ao renderizar HEIC.'});}
    });
  }catch(error){
    self.postMessage({id,ok:false,error:error?.message||'Falha ao decodificar HEIC.'});
  }
});
