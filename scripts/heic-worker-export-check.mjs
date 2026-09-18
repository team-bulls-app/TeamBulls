import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const file='modules/heic-libheif-worker-v10_10_12.js';
const converterFile='modules/heic-report-conversion-v10_10_12.js';
const swFile='sw.js';
const swLegacyFile='sw_47.js';
const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
assert(fs.existsSync(file),'Worker HEIC ausente.');
assert(fs.existsSync(converterFile),'Conversor HEIC ausente.');
assert(fs.existsSync(swFile),'Service Worker principal ausente.');
assert(fs.existsSync(swLegacyFile),'Service Worker alternativo ausente.');
const source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
const converter=fs.existsSync(converterFile)?fs.readFileSync(converterFile,'utf8'):'';
const sw=fs.existsSync(swFile)?fs.readFileSync(swFile,'utf8'):'';
const swLegacy=fs.existsSync(swLegacyFile)?fs.readFileSync(swLegacyFile,'utf8'):'';
if(source){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,'Worker HEIC possui JavaScript inválido: '+String(syntax.stderr||'').trim());
}
if(converter){
  const syntax=spawnSync(process.execPath,['--check',converterFile],{encoding:'utf8'});
  assert(syntax.status===0,'Conversor HEIC possui JavaScript inválido: '+String(syntax.stderr||'').trim());
}
for(const [needle,message] of [
  ["libheif-js@1.19.8/libheif/libheif.js",'Versão do libheif não está fixada.'],
  ['function resolveLibheif()','Worker não resolve as formas diferentes de exportação do libheif.'],
  ["typeof libheif!=='undefined'",'Worker não procura o global lexical libheif.'],
  ['self.module?.exports','Worker não possui fallback CommonJS.'],
  ['candidate?.default','Worker não possui fallback para export default.'],
  ["typeof candidate.HeifDecoder==='function'",'Worker não valida HeifDecoder antes de ficar pronto.'],
  ['HEIF=resolveLibheif()','Worker não usa o decoder efetivamente resolvido.'],
  ['const MAX_PIXELS=32000000','Limite preventivo de pixels HEIC foi removido.'],
  ["self.postMessage({type:'ready',ok:ready,error:initError})",'Handshake de inicialização HEIC foi removido.']
])assert(source.includes(needle),message);
assert(converter.includes("const VERSION='10.10.12-heic3'"),'Conversor HEIC não está na revisão de recuperação de cache.');
assert(converter.includes("heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker3"),'Conversor HEIC não rotacionou a URL do worker defeituoso em cache.');
for(const [name,text] of [['sw.js',sw],['sw_47.js',swLegacy]]){
  assert(text.includes("const CACHE_HOTFIX='heic-recovery1'"),`${name} não invalida o cache anterior de HEIC.`);
  assert(text.includes("'/modules/heic-report-conversion-v10_10_12.js'"),`${name} não trata o conversor HEIC como mutável/network-first.`);
  assert(text.includes("'/modules/heic-libheif-worker-v10_10_12.js'"),`${name} não trata o worker HEIC como mutável/network-first.`);
}
assert(sw===swLegacy,'sw.js e sw_47.js divergiram na recuperação de cache HEIC.');
if(fail.length){console.error('FALHA — worker HEIC/libheif\n- '+fail.join('\n- '));process.exit(1);}
console.log('APROVADO — HEIC resolve exports libheif e recupera celulares presos em cache antigo.');
