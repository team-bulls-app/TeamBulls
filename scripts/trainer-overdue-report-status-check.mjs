import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const moduleFile='modules/trainer-overdue-report-status-v10_10_33.js';
const module=read(moduleFile);
const config=read('config_v10_7.js');
const core=read('app_v10_10_9_core.js');

const syntax=spawnSync(process.execPath,['--check',moduleFile],{encoding:'utf8'});
assert(syntax.status===0,`Módulo de status do treinador possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);

const moduleName='trainer-overdue-report-status-v10_10_33.js?v=10.10.33-overduestatus1';
assert(config.includes(`'./modules/${moduleName}'`),'Loader não entrega a correção com URL única/versionada.');
const trainerOnly=config.match(/const trainerOnlyModules=new Set\(\[([\s\S]*?)\n  \]\);/)?.[1]||'';
assert(trainerOnly.includes(`MODULE_ROOT+'${moduleName}'`),'Correção administrativa precisa carregar somente no runtime do treinador.');

assert(core.includes("badge.textContent=state.pending?'ATUALIZAÇÃO PENDENTE':'EM DIA'"),'Baseline esperado mudou: revise a integração do status administrativo.');
assert(core.includes('const [doc,checkins]=await Promise.all(['),'Carregamento semanal base precisa continuar buscando agenda e histórico juntos.');
assert(module.includes("computeCheckinRequest(schedule,cachedCheckins())"),'Status precisa reutilizar a regra canônica do relatório semanal.');
assert(module.includes("schedule.enabled===false"),'Aluno sem relatórios semanais no plano não pode aparecer atrasado.');
assert(module.includes("badge.textContent=weekly.overdue?'RELATÓRIO ATRASADO':'RELATÓRIO PENDENTE'"),'Cartão administrativo não diferencia relatório vencido/pendente.');
assert(module.includes("badge.textContent='2 PENDÊNCIAS'"),'Cartão precisa representar relatório e atualização completa vencidos ao mesmo tempo.');
assert(module.includes("badge.textContent=state.overdue?'ATRASADO':'PENDENTE'"),'Programação semanal do treinador também precisa mostrar o atraso real.');
assert(module.includes('if(complete)complete.disabled=!monthly.pending'),'Relatório semanal não pode liberar a ação de concluir atualização completa.');
assert(module.includes('Próxima atualização completa:'),'A data da revisão completa precisa continuar visível quando só o relatório está atrasado.');
assert(module.includes('Relatório semanal previsto para ${due} ainda não foi enviado pelo aluno.'),'A interface precisa explicar a causa do atraso.');

assert(module.includes('const base=fetchWeeklyCheckins'),'Correção deve aproveitar a leitura semanal que já existe.');
assert(module.includes('checkinsByStudent.set(uid'),'Histórico carregado precisa ser reaproveitado em memória.');
assert(!module.includes("db.collection('weeklyCheckins')"),'Correção não pode duplicar consultas de relatórios semanais.');
assert(!module.includes('cloudGet('),'Correção não pode adicionar leitura Firestore própria.');
assert(!module.includes('cloudWrite('),'Correção visual não pode gravar no Firestore.');
assert(!module.includes('onSnapshot('),'Correção não deve criar listener adicional.');
assert(!module.includes('setInterval('),'Correção não deve introduzir polling.');
assert(module.includes('scheduleNextBoundary'),'Status precisa virar pendente na fronteira da data sem reload/polling.');
assert(module.includes("document.visibilityState==='visible'"),'Retorno do background precisa recalcular o vencimento em memória.');

if(failures.length){
  console.error('FALHA — status de relatório atrasado no painel do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — relatório semanal vencido tira o treinador de EM DIA, preserva a data da atualização completa e nunca libera a conclusão mensal por engano.');
