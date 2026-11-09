/* Team Bulls v10.10.10 — isolamento de treinador, lista reconciliada e saneamento defensivo da UI. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SECURITY_HARDENING_V101010__)return;
  window.__TEAM_BULLS_SECURITY_HARDENING_V101010__=true;

  const VERSION='10.10.10-security9';
  const SAFE_COLORS=new Set(['#e11d48','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b','#ef4444','#64748b']);
  const DEFAULT_COLOR='#e11d48';
  const authorizedStudents=new Set();

  function safeColor(value){
    const color=String(value||'').toLowerCase();
    return SAFE_COLORS.has(color)?color:DEFAULT_COLOR;
  }

  if(typeof normalizeWorkoutCollection==='function'&&!normalizeWorkoutCollection.__tbSecurity8){
    const base=normalizeWorkoutCollection;
    const wrapped=function(items){return base(items).map(workout=>({...workout,color:safeColor(workout?.color)}));};
    wrapped.__tbSecurity8=true;normalizeWorkoutCollection=wrapped;
  }

  function trainerSessionValid(){
    return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&CURRENT_USER?.uid&&typeof db!=='undefined'&&db;
  }

  function ensureMobileStyles(){
    if(document.getElementById('tb-security-mobile-style'))return;
    const style=document.createElement('style');style.id='tb-security-mobile-style';style.textContent=`
      #screen-trainer #student-list{width:100%;min-width:0;overflow:visible;}
      #screen-trainer .student-card{width:100%;min-width:0;}
      #screen-trainer .student-info{min-width:0;overflow:hidden;}
      #screen-trainer .student-name-row{display:flex;align-items:center;gap:7px;min-width:0;}
      #screen-trainer .student-name-row .student-name{min-width:0;flex:1;}
      #screen-trainer .tb-student-status-dot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%;}
      #screen-trainer .tb-student-status-dot.active{background:#22c55e;border:1px solid #86efac;box-shadow:0 0 6px 2px rgba(34,197,94,.7),0 0 13px rgba(34,197,94,.5);}
      #screen-trainer .tb-student-status-dot.inactive{background:#ef4444;border:1px solid #fca5a5;box-shadow:0 0 6px 2px rgba(239,68,68,.7),0 0 13px rgba(239,68,68,.5);}
      #screen-trainer .student-meta{display:block;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      #screen-trainer .student-actions{flex:0 0 auto;min-width:max-content;}
      .tb-student-link-health{margin:10px 18px 0;padding:9px 11px;border:1px solid var(--border);background:rgba(255,255,255,.025);color:var(--text-muted);font:500 9px/1.45 'DM Mono',monospace;letter-spacing:.25px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;}
      .tb-student-link-health.warn{border-color:rgba(245,158,11,.45);color:#d7b36a;background:rgba(245,158,11,.06);}
      .tb-student-link-health button{width:auto!important;margin:0!important;padding:6px 8px!important;min-height:30px!important;font-size:8px!important;}
      @media(max-width:520px){
        #screen-trainer .student-card{align-items:center;gap:9px;padding:13px 12px;}
        #screen-trainer .student-avatar{width:40px;height:40px;font-size:17px;}
        #screen-trainer .student-actions{gap:5px;}
        #screen-trainer .btn-view-student,#screen-trainer .toggle-btn{padding-left:9px;padding-right:9px;min-width:0;}
      }
      @media(max-width:370px){
        #screen-trainer .student-card{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;}
        #screen-trainer .student-actions{grid-column:2;justify-content:flex-start;width:100%;}
      }
    `;document.head.appendChild(style);
  }

  async function runManualLinkCheck(button){
    const api=window.TeamBullsLegacyStudentLinkRepair;
    if(!api?.runAndRefresh){showToast?.('A verificação de vínculos ainda está sendo preparada. Tente novamente em instantes.',true);return;}
    if(button){button.disabled=true;button.textContent='VERIFICANDO...';}
    try{
      const result=await api.runAndRefresh();
      const repaired=(result?.repaired||0)+(result?.preV107Migrated||0);
      if(!repaired&&!result?.unresolved&&!result?.failed)showToast?.('✓ Vínculos conferidos. Nenhuma correção necessária.');
    }catch(error){
      console.warn('[Team Bulls] Verificação manual de vínculos indisponível',error);
      showToast?.('Não foi possível verificar os vínculos agora.',true);
    }finally{
      if(button?.isConnected){button.disabled=false;button.textContent='VERIFICAR VÍNCULOS';}
    }
  }

  function renderLinkHealth(message,warn=false,{manualAction=true}={}){
    const screen=document.getElementById('screen-trainer');if(!screen)return;
    let el=document.getElementById('tb-student-link-health');
    if(!el){
      el=document.createElement('div');el.id='tb-student-link-health';el.className='tb-student-link-health';
      const list=document.getElementById('student-list');
      (list?.parentElement||screen).insertBefore(el,list||null);
    }
    el.classList.toggle('warn',!!warn);el.textContent='';
    const label=document.createElement('span');label.textContent=message;el.appendChild(label);
    if(manualAction){
      const button=document.createElement('button');button.type='button';button.className='btn-add-set';button.textContent='VERIFICAR VÍNCULOS';
      button.title='Executa a reconciliação de vínculos antigos somente quando solicitado, sem leituras automáticas extras.';
      button.addEventListener('click',()=>runManualLinkCheck(button));el.appendChild(button);
    }
  }

  if(typeof renderTrainer==='function'&&!renderTrainer.__tbSecurity8){
    const securedRenderTrainer=async function(){
      if(!trainerSessionValid())return;
      ensureMobileStyles();
      ensureGlobalCatalogs?.();
      const trainerUid=String(CURRENT_USER.uid),loadSeq=++TRAINER_LIST_LOAD_SEQ;
      const chip=document.getElementById('trainer-chip-name');if(chip)chip.textContent=CURRENT_USER?.name||'treinador';
      try{
        /* Única consulta necessária para montar o painel. Vínculos antigos não são
           mais auditados automaticamente a cada render: a conferência ficou sob
           ação manual para não elevar o piso diário de leituras do Firestore. */
        const snap=await withTimeout(
          db.collection('users').where('role','==','student').where('trainerId','==',trainerUid).get(),
          CLOUD_READ_TIMEOUT_MS,
          'lista de alunos vinculados'
        );
        const students=snap.docs.map(d=>({...d.data(),uid:d.id})).filter(student=>student.role==='student'&&String(student.trainerId||'')===trainerUid);
        if(loadSeq!==TRAINER_LIST_LOAD_SEQ||CURRENT_USER?.role!=='trainer'||String(CURRENT_USER.uid)!==trainerUid)return;
        authorizedStudents.clear();students.forEach(student=>authorizedStudents.add(String(student.uid)));
        if(window.TeamBullsStudentAdministration?.renderRoster){await window.TeamBullsStudentAdministration.renderRoster(students);renderLinkHealth(`${students.length} aluno(s) encontrados no cadastro.`);return;}
        students.sort((a,b)=>normalizedName(a.name).localeCompare(normalizedName(b.name),'pt-BR')||a.uid.localeCompare(b.uid));
        const active=students.filter(s=>s.status==='active').length,inactive=students.filter(s=>s.status==='inactive').length;
        const stats=document.getElementById('trainer-stats');if(stats)stats.innerHTML=
          `<div class="stat-cell"><div class="num">${students.length}</div><div class="lbl">Arquivos</div></div>`+
          `<div class="stat-cell"><div class="num" style="color:var(--success)">${active}</div><div class="lbl">Ativos</div></div>`+
          `<div class="stat-cell"><div class="num" style="color:var(--text-muted)">${inactive}</div><div class="lbl">Pausados</div></div>`;
        const list=document.getElementById('student-list'),empty=document.getElementById('student-empty');
        if(!list)return;
        if(!students.length){list.innerHTML='';if(empty)empty.style.display='block';renderLinkHealth('Nenhum aluno vinculado ao treinador.',true);return;}
        if(empty)empty.style.display='none';
        list.innerHTML=students.map(s=>{
          const initials=(s.name||'?').split(/\s+/).filter(Boolean).map(n=>n[0]).slice(0,2).join('').toUpperCase();
          const isActive=s.status==='active',toggleLabel=isActive?'PAUSAR':'ATIVAR',toggleClass=isActive?'deactivate':'activate';
          const statusLabel=isActive?'Aluno ativo':'Aluno pausado';
          return`<div class="student-card" data-student-uid="${esc(s.uid)}" data-student-status="${isActive?'active':'inactive'}">
            <div class="student-avatar">${esc(initials)}</div>
            <div class="student-info">
              <div class="archive-file-kicker">ARQUIVO ${studentArchiveCode(s.uid)}</div>
              <div class="student-name-row"><span class="tb-student-status-dot ${isActive?'active':'inactive'}" role="img" aria-label="${statusLabel}" title="${statusLabel}"></span><div class="student-name">${esc(s.name||'Sem nome')}</div></div>
              <div class="student-meta" title="${esc(s.email||'')}">${esc(s.email||'')}</div>
            </div>
            <div class="student-actions">
              <button class="btn-view-student" onclick="viewStudent(${jsArg(s.uid)},${jsArg(s.name||'Aluno')},${jsArg(s.email||'')},${jsArg(s.status||'active')})">ABRIR</button>
              <button class="toggle-btn ${toggleClass}" onclick="toggleStudent(${jsArg(s.uid)},${isActive})">${toggleLabel}</button>
            </div>
          </div>`;
        }).join('');
        renderLinkHealth(`${students.length} aluno(s) encontrados no cadastro.`);
      }catch(error){
        if(loadSeq===TRAINER_LIST_LOAD_SEQ){
          console.error('renderTrainer seguro',error);
          const list=document.getElementById('student-list'),empty=document.getElementById('student-empty');
          if(list)list.innerHTML='<div class="session-block" style="border-color:var(--warn)"><div style="color:var(--warn);font-size:13px;margin-bottom:8px">Não foi possível carregar os alunos.</div><button class="btn-add-set" onclick="renderTrainer()">TENTAR NOVAMENTE</button></div>';
          if(empty)empty.style.display='none';
          renderLinkHealth('Falha ao consultar os alunos. Verifique a conexão e as regras do Firebase.',true);
        }
      }
    };
    securedRenderTrainer.__tbSecurity8=true;
    renderTrainer=securedRenderTrainer;
  }

  if(typeof viewStudent==='function'&&!viewStudent.__tbSecurity8){
    const base=viewStudent;
    const wrapped=async function(uidValue,...args){
      const target=String(uidValue||'');
      if(CURRENT_USER?.role==='trainer'&&!authorizedStudents.has(target)){showToast?.('Este aluno não foi encontrado na lista atual.',true);return false;}
      return base.call(this,uidValue,...args);
    };
    wrapped.__tbSecurity8=true;viewStudent=wrapped;
  }

  if(typeof toggleStudent==='function'&&!toggleStudent.__tbSecurity8){
    const base=toggleStudent;
    const wrapped=function(uidValue,...args){
      const target=String(uidValue||'');
      if(CURRENT_USER?.role==='trainer'&&!authorizedStudents.has(target)){showToast?.('Aluno não encontrado na lista atual.',true);return false;}
      return base.call(this,uidValue,...args);
    };
    wrapped.__tbSecurity8=true;toggleStudent=wrapped;
  }

  window.TeamBullsSecurityAudit=Object.freeze({version:VERSION,safeColor});
  /* Se a camada chegar depois de uma renderização antiga, refaz uma vez por
     segurança. No fluxo normal ela é carregada antes da autenticação e não gera
     consulta extra. */
  if(CURRENT_USER?.role==='trainer'&&document.getElementById('screen-trainer')?.classList.contains('active'))queueMicrotask(()=>renderTrainer());
})();
