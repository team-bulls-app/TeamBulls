(()=>{
  'use strict';
  if(window.__TEAM_BULLS_CARDIO_FINISH_ALERT_101011__)return;
  window.__TEAM_BULLS_CARDIO_FINISH_ALERT_101011__=true;
  const VERSION='10.10.11-cardioalert2';
  const SETTINGS_KEY='team_bulls_cardio_finish_alert_v1';
  const ALERT_KEY_PREFIX='team_bulls_cardio_alerted_';
  let audioContext=null;

  function settings(){try{return{sound:true,vibrate:true,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}}catch(error){return{sound:true,vibrate:true}}}
  function saveSettings(next){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch(error){}syncPreferences();}
  function syncPreferences(){
    const current=settings();
    for(const input of document.querySelectorAll('[data-cardio-alert]')){
      input.checked=!!current[input.dataset.cardioAlert];
      if(input.dataset.cardioAlert==='vibrate')input.disabled=typeof navigator.vibrate!=='function';
    }
  }
  function restFinished(){playAlarm();vibrate();if(typeof showToast==='function')showToast('Descanso concluído');}
  function primeAudio(){if(!settings().sound)return null;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;audioContext=audioContext||new AC();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});return audioContext;}catch(error){return null;}}
  function beep(ctx,frequency,start,duration,gainValue=.13){const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(gainValue,start+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+duration+.03);}
  function playAlarm(){if(!settings().sound)return;const ctx=primeAudio();if(!ctx)return;try{const t=ctx.currentTime+.02;beep(ctx,880,t,.22);beep(ctx,1046,t+.3,.22);beep(ctx,1320,t+.6,.5,.16);}catch(error){console.warn('[Team Bulls] alarme cardio',error);}}
  function vibrate(){if(settings().vibrate&&navigator.vibrate)try{navigator.vibrate([300,140,300,140,650]);}catch(error){}}
  function fingerprint(item,state){return String(item?.id||'cardio')+'_'+Math.trunc(Number(state?.endAt)||0);}
  function alreadyAlerted(key){try{return sessionStorage.getItem(ALERT_KEY_PREFIX+key)==='1'||localStorage.getItem(ALERT_KEY_PREFIX+key)==='1';}catch(error){return false;}}
  function markAlerted(key){try{sessionStorage.setItem(ALERT_KEY_PREFIX+key,'1');localStorage.setItem(ALERT_KEY_PREFIX+key,'1');}catch(error){}}
  function maybeAlert(item,state){
    if(!item||!state||!state.endAt||state.remainingSeconds>0)return false;
    const elapsed=Date.now()-Number(state.endAt);if(elapsed<-1500||elapsed>15*60*1000)return false;
    const key=fingerprint(item,state);if(alreadyAlerted(key))return true;
    markAlerted(key);playAlarm();vibrate();if(typeof showToast==='function')showToast('⏱️ Cardio concluído — tempo atingido');return true;
  }
  function ensureControls(){
    const card=document.querySelector('.screen.active .cardio-timer-card');if(!card)return;
    if(card.querySelector('#tb-cardio-alert-controls'))return;
    const current=settings(),host=document.createElement('div');
    host.id='tb-cardio-alert-controls';host.className='tb-cardio-alert-controls';card.appendChild(host);
    host.innerHTML=`<span>AVISO AO TERMINAR</span><label><input type="checkbox" data-cardio-alert="sound" ${current.sound?'checked':''}> 🔔 Alarme</label><label><input type="checkbox" data-cardio-alert="vibrate" ${current.vibrate?'checked':''}> 📳 Vibrar</label>`;

    syncPreferences();
  }
  if(typeof readCardioTimer==='function'){
    const base=readCardioTimer;
    readCardioTimer=function(item){
      const state=base.apply(this,arguments);if(!state)return state;
      if(maybeAlert(item,state)&&state.running&&state.remainingSeconds<=0&&!state.completedAt){
        // Marca a conclusão antes do fluxo legado processá-la. Assim o alerta antigo
        // não toca junto com o alarme configurável, mas a persistência original continua intacta.
        return{...state,completedAt:Date.now()};
      }
      return state;
    };
  }
  if(typeof startCardioTimer==='function'){const base=startCardioTimer;startCardioTimer=function(){primeAudio();const result=base.apply(this,arguments);requestAnimationFrame(ensureControls);return result;};}
  if(typeof resetCardioTimer==='function'){const base=resetCardioTimer;resetCardioTimer=function(){const result=base.apply(this,arguments);requestAnimationFrame(ensureControls);return result;};}
  if(typeof updateCardioTimerDisplay==='function'){const base=updateCardioTimerDisplay;updateCardioTimerDisplay=function(){const result=base.apply(this,arguments);ensureControls();return result;};}
  document.addEventListener('change',event=>{
    const input=event.target.closest?.('input[data-cardio-alert]');
    if(!input||!['sound','vibrate'].includes(input.dataset.cardioAlert))return;
    saveSettings({...settings(),[input.dataset.cardioAlert]:input.checked});
    if(input.dataset.cardioAlert==='sound'&&input.checked)primeAudio();
  });
  document.addEventListener('click',event=>{if(event.target.closest?.('.cardio-timer-card button'))primeAudio();},{capture:true,passive:true});
  const sync=()=>{if(!document.hidden){try{updateCardioTimerDisplay();if(typeof REST_INTERVAL!=='undefined'&&REST_INTERVAL&&!REST_PAUSED)restTick();}catch(error){}ensureControls();syncPreferences();}};
  document.addEventListener('visibilitychange',sync,{passive:true});window.addEventListener('pageshow',sync,{passive:true});
  const style=document.createElement('style');style.id='tb-cardio-alert-style';style.textContent=`.tb-cardio-alert-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;padding:9px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.025)}.tb-cardio-alert-controls>span{font:800 8px 'DM Mono',monospace;letter-spacing:.7px;color:#777}.tb-cardio-alert-controls label{display:flex;align-items:center;gap:5px;color:#bbb;font:700 9px 'DM Mono',monospace;cursor:pointer}.tb-cardio-alert-controls input{accent-color:#e11d48}`;document.head.appendChild(style);
  window.TeamBullsCardioAlert=Object.freeze({version:VERSION,settings,prime:primeAudio,restFinished,test:()=>{primeAudio();playAlarm();vibrate();}});
  requestAnimationFrame(()=>{ensureControls();syncPreferences();});
})();