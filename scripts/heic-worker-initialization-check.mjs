import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const original=fs.readFileSync('modules/heic-libheif-worker-v10_10_12.js','utf8');
const source=original.replaceAll('waitForLibheif(8000)','waitForLibheif(90)');
assert(original.includes('LIBHEIF_FALLBACK_URL'));
assert(original.includes('waitForLibheif(8000)'));

class Decoder{
  decode(){return[{get_width:()=>1,get_height:()=>1,display:(target,done)=>{target.data.set([12,34,56,255]);done(target);}}];}
}
async function scenario(importer){
  const messages=[],listeners={};
  let readyResolve;
  const ready=new Promise(resolve=>readyResolve=resolve);
  const self={postMessage:message=>{messages.push(message);if(message.type==='ready')readyResolve(message);},addEventListener:(name,handler)=>listeners[name]=handler};
  const context={self,importScripts:url=>importer(url,self),setTimeout,Date,Promise,Uint8Array,Uint8ClampedArray,ArrayBuffer};
  vm.createContext(context);vm.runInContext(source,context);
  const result=await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('worker sem handshake')),1000))]);
  return{result,messages,listeners};
}

let fallbackLoaded=false;
const delayed=await scenario((url,self)=>{if(url.includes('bundle'))fallbackLoaded=true;else setTimeout(()=>self.libheif={HeifDecoder:Decoder},20);});
assert.equal(delayed.result.ok,true,'decoder exposto após importScripts deve ficar pronto');
assert.equal(fallbackLoaded,false,'biblioteca principal pronta não deve baixar o fallback');
delayed.listeners.message({data:{id:'photo',buffer:new ArrayBuffer(4)}});
const decoded=delayed.messages.find(item=>item.id==='photo');
assert.equal(decoded?.ok,true,'worker pronto deve decodificar a foto');
assert.deepEqual(Array.from(new Uint8Array(decoded.rgba)),[12,34,56,255]);

const factory=await scenario((url,self)=>{self.libheif=()=>Promise.resolve({HeifDecoder:Decoder});});
assert.equal(factory.result.ok,true,'export assíncrono do módulo deve ser aguardado');

const fallback=await scenario((url,self)=>{if(url.includes('bundle'))self.libheif={HeifDecoder:Decoder};});
assert.equal(fallback.result.ok,true,'bundle alternativo deve recuperar decoder ausente');

const unavailable=await scenario(()=>{throw new Error('offline');});
assert.equal(unavailable.result.ok,false,'falha nas duas fontes deve ser comunicada');
assert(unavailable.result.error);

const converter=fs.readFileSync('modules/heic-report-conversion-v10_10_12.js','utf8');
assert(converter.includes('heicworker4')&&converter.includes('},35000);'),'novo worker precisa de URL renovada e tempo para inicializar');
assert(converter.includes('if(!(prepared instanceof File))'),'lote de seis fotos deve parar na primeira falha');
assert(converter.includes('const convertedHeicInputs=new WeakMap()')&&converter.includes('convertedHeicInputs.set(file,jpeg)'),'JPG convertido deve ser reutilizado no envio depois da prévia');
console.log('APROVADO — decoder HEIC tardio, factory assíncrona, fallback, decodificação e falha clara no lote.');
