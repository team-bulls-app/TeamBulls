import fs from 'node:fs';

const file='modules/desktop-performance-v10_10_9.js';
const source=fs.readFileSync(file,'utf8');

function expect(condition,message){
  if(!condition){
    console.error('FAIL:',message);
    process.exitCode=1;
  }
}

expect(source.includes("const DESKTOP_QUERY=window.matchMedia?.(DESKTOP_MEDIA)||null;"),'desktop media query deve ser reutilizada em vez de recriada a cada evento');
expect(source.includes('let desktopListenersBound=false;'),'estado dos listeners de scroll deve ser explícito');
expect(source.includes('function bindScrollState()'),'listeners desktop devem ter bind controlado');
expect(source.includes('function unbindScrollState()'),'listeners desktop devem ser removidos ao sair do modo desktop');
expect(source.includes("window.removeEventListener('scroll',markDesktopScrolling)"),'scroll global deve ser removido fora do desktop');
expect(source.includes("document.getElementById('app')?.removeEventListener('scroll',markDesktopScrolling)"),'scroll do app deve ser removido fora do desktop');
expect(source.includes('function cancelMediaTune()'),'tarefas de mídia pendentes devem ser canceláveis');
expect(source.includes('function restoreChartDefaults()'),'defaults globais do Chart devem ser restaurados fora do desktop');
expect(source.includes("DESKTOP_QUERY.addEventListener('change',syncDesktopState)"),'mudança de breakpoint deve usar MediaQueryList quando disponível');
expect(!source.includes("window.addEventListener('scroll',markDesktopScrolling,{passive:true});\n    document.getElementById('app')?.addEventListener('scroll',markDesktopScrolling,{passive:true});\n  }\n\n  function syncDesktopState"),'listeners não devem permanecer permanentemente instalados no runtime mobile');
expect(source.includes("version:'10.10.9-desktop2'"),'versão de higiene desktop deve identificar a revisão nova');

if(!process.exitCode)console.log('OK desktop runtime hygiene');
