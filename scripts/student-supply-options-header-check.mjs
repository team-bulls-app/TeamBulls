import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=path=>fs.readFileSync(path,'utf8');

const modulePath='modules/student-home-layout-v10_10_15.js';
const labelModulePath='modules/supply-options-label-v10_10_24.js';
const source=read(modulePath);
const labelSource=read(labelModulePath);
const config=read('config_v10_7.js');
const index=read('index.html');
const worker=read('sw.js');

for(const file of [modulePath,labelModulePath,'config_v10_7.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

assert(index.includes('id="screen-diet-detail"'),'Tela de detalhe de suprimentos/dieta ausente.');
assert(index.includes('onclick="openFoodOptionsFromDiet()"'),'Destino canônico das opções de alimentos foi removido do detalhe da dieta.');
assert(source.includes('function patchSupplyOptionsHeader()'),'Patch visual de Opções de suprimentos ausente.');
assert(source.includes('#screen-diet-detail .header button[onclick*="openFoodOptionsFromDiet"]'),'Patch não está preso ao botão correto do cabeçalho do aluno.');
assert(source.includes("button.setAttribute('aria-label','Opções de suprimentos')"),'Atalho não possui nome acessível coerente.');
assert(source.includes("button.innerHTML=supplyOptionsIcon()+'<span>Opções de suprimentos</span>'"),'Texto visível Opções de suprimentos não está ao lado do ícone.');
assert(source.includes('function supplyOptionsIcon()'),'Ícone específico de alimento não foi definido.');
assert(source.includes('tb-supply-options-header-btn svg'),'Ícone não possui estilo vetorial coerente com a interface.');
assert(source.includes('max-width:min(190px,48vw)'),'Atalho não possui limite responsivo para preservar o título no mobile.');
assert(source.includes('ensureStudentDietLabel();patchSupplyOptionsHeader();'),'Patch não acompanha a sincronização event-driven da tela.');

const labelSrc='./modules/supply-options-label-v10_10_24.js?v=10.10.24-supplylabel1';
assert(config.includes(labelSrc),'Runtime compartilhado não carrega a correção do título de Opções de suprimentos.');
const sharedStart=config.indexOf('const modules=['),sharedEnd=config.indexOf('];',sharedStart);
const sharedQueue=sharedStart>=0&&sharedEnd>sharedStart?config.slice(sharedStart,sharedEnd):'';
assert(sharedQueue.indexOf(labelSrc)>=0&&sharedQueue.indexOf(labelSrc)<sharedQueue.indexOf('./modules/stability_v10_10_9.js'),'Correção leve do título deve entrar no início da fila compartilhada.');
assert(labelSource.includes("const VERSION='10.10.24-supplylabel1'"),'Módulo do título não possui revisão própria.');
assert(labelSource.includes("document.querySelector('#screen-food-options .options-intro-title')"),'Correção do título não está restrita à tela de opções.');
assert(labelSource.includes("title.textContent='Opções de suprimentos'"),'Título visível não é normalizado para Opções de suprimentos.');
assert(!labelSource.includes('Opções de suplementos'),'Termo incorreto reapareceu no módulo de correção.');
assert(labelSource.includes('const base=renderFoodOptions'),'Correção não acompanha novas renderizações da tabela.');
assert(labelSource.includes('renderFoodOptions=wrapped'),'Renderização das opções não reaplica o título correto.');
assert(!labelSource.includes('MutationObserver'),'Correção simples do título não deve criar observer.');
assert(!labelSource.includes('db.collection'),'Correção visual não deve acessar Firestore.');
assert(worker.includes("'/viewport_v10_10_9.js','/boot_v10.js','/config_v10_7.js'"),'Configuração mutável deixou de ser network-first no Service Worker.');
assert(worker.includes("'/modules/usability-checkup-v10_10_9.js','/modules/student-home-profile-v10_10_12.js','/modules/student-home-layout-v10_10_15.js'"),'Home do aluno deixou de ser network-first no Service Worker.');

if(failures.length){
  console.error('FALHA — Opções de suprimentos\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — Opções de suprimentos usa nomenclatura correta na tela compartilhada, mantém ícone/destino e entrega segura pelo runtime.');
