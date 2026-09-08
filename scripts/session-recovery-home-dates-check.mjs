import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

for(const path of ['config_v10_7.js','modules/session-restore-recovery-ux-v10_10_31.js','modules/student-home-fast-protocol-date-v10_10_31.js']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const config=read('config_v10_7.js');
const session=read('modules/session-restore-recovery-ux-v10_10_31.js');
const dates=read('modules/student-home-fast-protocol-date-v10_10_31.js');

has(config,"'./modules/session-restore-recovery-ux-v10_10_31.js?v=10.10.31-sessionrestore1'",'Guard de restauração não está no caminho crítico.');
has(config,"'./modules/student-home-fast-protocol-date-v10_10_31.js?v=10.10.31-fastdates1'",'Datas rápidas não estão no runtime prioritário do aluno.');
assert(config.indexOf('student-home-layout-v10_10_15.js')<config.indexOf('student-home-fast-protocol-date-v10_10_31.js'),'Datas rápidas devem executar depois do layout canônico da Home.');

has(session,'const QUIET_WINDOW_MS=12000;','Janela silenciosa de restauração foi alterada.');
has(session,"label.textContent='verificando sessão...'",'Restauração válida não mantém feedback discreto no loading.');
has(session,"button.hidden=!visible",'Botão de correção de cache não é ocultado durante restauração reconhecida.');
has(session,'não é necessário corrigir a atualização','Restauração lenta ainda pode sugerir indevidamente limpeza de cache.');
has(session,'transientMessage(message)&&returningSession()','Supressão não está restrita à restauração conhecida.');
lacks(session,'caches.delete(','Guard de sessão não pode apagar cache automaticamente.');
lacks(session,'unregister(','Guard de sessão não pode remover Service Worker.');
lacks(session,'db.collection(','Guard visual não pode gerar leitura ou gravação Firestore.');
lacks(session,'setInterval(','Guard visual não deve manter polling permanente.');

has(dates,"const CACHE_PREFIX='team_bulls_home_protocol_date_v1_'",'Home não possui cache local isolado da data do protocolo.');
has(dates,'stateFromRuntime(uid)||cacheRead(uid)||stateFromHomeText()','Home não prioriza estado em memória/cache antes da rede.');
has(dates,"strong.textContent=safe.date",'Data rápida não substitui CARREGANDO imediatamente.');
has(dates,"onlyLoading&&current&&current!=='CARREGANDO...'",'Hotfix pode sobrescrever uma data fresca já renderizada.');
has(dates,"observer.observe(host,{subtree:true,childList:true,characterData:true})",'Cache de data não acompanha apenas o bloco restrito de estatísticas.');
has(dates,'window.TeamBullsStudentHomeLayout=wrapped','Refresh oficial da Home não recebe pintura rápida antes da consulta.');
lacks(dates,'db.collection(','Datas rápidas não podem criar leitura Firestore paralela.');
lacks(dates,'fetch(','Datas rápidas não podem criar requisição paralela.');
lacks(dates,'setInterval(','Datas rápidas não podem manter polling permanente.');

if(fail.length){
  console.error('FALHA — restauração de sessão / datas rápidas\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — restauração válida fica silenciosa antes do fallback real; Home mostra data conhecida/cache imediatamente sem leituras extras.');
