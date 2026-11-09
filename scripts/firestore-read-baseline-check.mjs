import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)fail.push(msg);};
const has=(text,needle,msg)=>assert(text.includes(needle),msg);
const lacks=(text,needle,msg)=>assert(!text.includes(needle),msg);

const securityPath='modules/security-hardening-v10_10_9.js';
const legacyPath='modules/legacy-student-link-repair-v10_10_10.js';
for(const file of [securityPath,legacyPath]){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const security=read(securityPath),legacy=read(legacyPath),config=read('config_v10_7.js'),sw=read('sw.js'),sw47=read('sw_47.js');

// Painel normal: uma consulta vinculada; zero auditoria de convites em background.
has(security,"where('role','==','student').where('trainerId','==',trainerUid).get()",'Painel não usa consulta estritamente vinculada ao treinador.');
lacks(security,"db.collection('studentInvites')",'Painel normal voltou a consultar convites automaticamente.');
lacks(security,'auditInviteLinks(trainerUid,students.length)','renderTrainer voltou a disparar auditoria de vínculos em background.');
has(security,"button.textContent='VERIFICAR VÍNCULOS'",'Verificação de vínculos antigos não está disponível sob ação explícita.');
has(security,'runManualLinkCheck','Botão manual não possui fluxo dedicado.');

// Reconciliador: nenhuma rede automática quando a migração administrativa está desligada.
has(legacy,'function runAutomaticMigrationIfAuthorized()','Gate de reconciliação automática ausente.');
has(legacy,'if(!trainerMigrationAuthorized(trainerUid))return true','Sessão normal ainda pode iniciar reconciliação automática.');
has(legacy,'CURRENT_USER?.legacyMigrationEnabled===true','Migração automática não exige autorização administrativa já carregada.');
lacks(legacy,"'verificar autorização da migração legada'",'Reconciliador ainda relê o perfil do treinador só para conferir a flag.');
has(legacy,'runAndRefresh','Reconciliação manual foi removida junto com a automática.');
has(legacy,"studentInvites').where('trainerId','==',trainerUid)",'Reconciliação manual perdeu isolamento por treinador.');

has(config,'security-hardening-v10_10_9.js?v=10.10.10-security9','Loader não entrega security8.');
has(config,'legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links6','Loader não entrega legacy-links6.');
for(const [name,text] of [['sw.js',sw],['sw_47.js',sw47]]){
  assert(/const CACHE_HOTFIX='[^']+'/.test(text),`${name} não possui revisão explícita do shell.`);
  has(text,'security-hardening-v10_10_9.js?v=10.10.10-security9',`${name} não prepara security8 offline.`);
  has(text,'legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links6',`${name} não prepara legacy-links6 offline.`);
}

if(fail.length){console.error('FALHA — Firestore read baseline\n- '+fail.join('\n- '));process.exit(1);}
console.log('Firestore read baseline OK — painel normal não audita convites nem reconcilia vínculos em background; revisão global do shell pode evoluir independentemente.');