import fs from 'node:fs';

const fail=[];
const read=p=>fs.readFileSync(p,'utf8');
const assert=(ok,msg)=>{if(!ok)fail.push(msg);};

const security=read('modules/security-hardening-v10_10_9.js');
const config=read('config_v10_7.js');

assert(!security.includes("where('role','==','student').get()"),'A lista do treinador voltou a consultar todos os estudantes sem vínculo.');
assert(security.includes("where('role','==','student').where('trainerId','==',trainerUid).get()"),'Consulta vinculada por trainerId não está presente.');
assert(security.includes("const VERSION='10.10.10-security9'"),'A camada de segurança não está na versão security8.');
assert(config.includes('security-hardening-v10_10_9.js?v=10.10.10-security9'),'O cache-bust do módulo security8 não está carregado.');
assert(security.includes('authorizedStudents.clear()')&&security.includes('students.forEach(student=>authorizedStudents.add(String(student.uid)))'),'A lista autorizada não é reconstruída a partir dos alunos exibidos.');
assert(security.includes("student.role==='student'&&String(student.trainerId||'')===trainerUid"),'A UI não revalida o vínculo do aluno retornado.');
assert(!security.includes('auditInviteLinks(trainerUid,students.length)'),'O painel voltou a consultar convites automaticamente a cada render.');
assert(!security.includes("db.collection('studentInvites')"),'A camada normal do painel não deve consultar studentInvites.');
assert(security.includes("button.textContent='VERIFICAR VÍNCULOS'"),'A conferência de vínculos antigos deixou de existir como ação manual.');
assert(security.includes('TeamBullsLegacyStudentLinkRepair'),'O botão manual não está ligado ao reconciliador legado.');
assert(security.includes('tb-student-status-dot')&&security.includes("isActive?'active':'inactive'"),'Indicador visual de status do aluno não está ligado ao status real.');
assert(security.includes("background:#22c55e")&&security.includes("background:#ef4444"),'Indicador não possui estados verde ativo e vermelho pausado.');
assert(security.includes('box-shadow:0 0 6px 2px rgba(34,197,94,.7)')&&security.includes('box-shadow:0 0 6px 2px rgba(239,68,68,.7)'),'Indicador perdeu o brilho visual dos estados.');
assert(security.includes('student-name-row')&&security.includes('student-meta'),'Indicador não está separado da linha truncável do e-mail.');

if(fail.length){
  console.error('FALHA — trainer student list check\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — painel usa apenas alunos vinculados e diagnóstico legado não gera leituras automáticas.');
