import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('modules/trainer-canonical-inbox-v10_10_58.js','utf8');
const start=source.indexOf('async function markAllRead(){');
const end=source.indexOf('\n  function hookFilters()',start);
assert(start>=0&&end>start,'Não foi possível localizar a ação canônica de marcar como lido.');

function harness({indexFails=[],writeFails=[],switchTrainerDuringIndex=false}={}){
  const rows=[
    {id:'ok-a',read:false},{id:'missing-index',read:false},
    {id:'write-fails',read:false},{id:'ok-b',read:false}
  ];
  const writes=[],messages=[];let renders=0;
  const sandbox={items:rows,REPAIR_CONCURRENCY:4,trainer:()=>true,uid:'trainer-a',trainerUid:()=>sandbox.uid,
    refresh:async()=>{},ensureIndex:async row=>{if(switchTrainerDuringIndex)sandbox.uid='trainer-b';return !indexFails.includes(row.id);},
    eventCollection:uid=>({doc:id=>({set:async()=>{writes.push({uid,id});if(writeFails.includes(id))throw new Error('permission-denied');}})}),
    nowStamp:()=>({serverTimestamp:true}),timeout:task=>task,
    mapWithLimit:async(list,_limit,worker)=>Promise.all(list.map(worker)),
    render:()=>{renders++;},showToast:(message,error=false)=>messages.push({message,error}),
    console:{warn:()=>{}},db:{batch:()=>{throw new Error('markAllRead must not use a failing all-or-nothing batch');}}
  };
  vm.createContext(sandbox);vm.runInContext(source.slice(start,end),sandbox);
  return{sandbox,rows,writes,messages,get renders(){return renders;}};
}

{
  const h=harness({indexFails:['missing-index'],writeFails:['write-fails']});
  await h.sandbox.markAllRead();
  assert.deepEqual(h.writes.map(row=>row.id),['ok-a','write-fails','ok-b'],'Um índice ausente deve ser ignorado sem cancelar as gravações restantes.');
  assert(h.writes.every(row=>row.uid==='trainer-a'),'Cada gravação deve permanecer no treinador capturado no início da ação.');
  assert.deepEqual(h.rows.map(row=>row.read),[true,false,false,true],'A tela só deve marcar como lidos os documentos confirmados.');
  assert.match(h.messages[0]?.message||'',/Marquei 2 relatório\(s\); 2 não puderam ser atualizados/,'Falhas parciais precisam informar quantos registros realmente foram atualizados.');
  assert.equal(h.renders,1,'A lista deve redesenhar uma vez com os resultados confirmados.');
}

{
  const h=harness({switchTrainerDuringIndex:true});
  await h.sandbox.markAllRead();
  assert.deepEqual(h.writes,[],'Troca de conta durante a indexação não pode gravar no treinador novo.');
  assert(h.rows.every(row=>row.read===false),'Troca de conta não pode marcar a lista antiga como lida.');
}

console.log('APROVADO — Central marca registros individualmente, preserva itens não confirmados e isola troca de conta.');
