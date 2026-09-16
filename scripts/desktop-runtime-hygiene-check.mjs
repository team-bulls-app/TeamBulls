import fs from 'node:fs';

const desktop=fs.readFileSync('modules/desktop-performance-v10_10_9.js','utf8');
const globalPerf=fs.readFileSync('modules/global-performance-v10_10_9.js','utf8');

function expect(condition,message){
  if(!condition){
    console.error('FAIL:',message);
    process.exitCode=1;
  }
}

expect(desktop.includes("const DESKTOP_QUERY=window.matchMedia?.(DESKTOP_MEDIA)||null;"),'desktop media query deve ser reutilizada em vez de recriada a cada evento');
expect(desktop.includes('let desktopListenersBound=false;'),'estado dos listeners de scroll deve ser explícito');
expect(desktop.includes('function bindScrollState()'),'listeners desktop devem ter bind controlado');
expect(desktop.includes('function unbindScrollState()'),'listeners desktop devem ser removidos ao sair do modo desktop');
expect(desktop.includes("window.removeEventListener('scroll',markDesktopScrolling)"),'scroll global deve ser removido fora do desktop');
expect(desktop.includes("document.getElementById('app')?.removeEventListener('scroll',markDesktopScrolling)"),'scroll do app deve ser removido fora do desktop');
expect(desktop.includes('function cancelMediaTune()'),'tarefas de mídia pendentes devem ser canceláveis');
expect(desktop.includes('function restoreChartDefaults()'),'defaults globais do Chart devem ser restaurados fora do desktop');
expect(desktop.includes("DESKTOP_QUERY.addEventListener('change',syncDesktopState)"),'mudança de breakpoint deve usar MediaQueryList quando disponível');
expect(desktop.includes("version:'10.10.9-desktop2'"),'versão de higiene desktop deve identificar a revisão nova');

expect(globalPerf.includes("const COARSE_QUERY=window.matchMedia?.('(pointer:coarse)')||null;"),'capacidade coarse deve reutilizar MediaQueryList');
expect(globalPerf.includes("const REDUCED_QUERY=window.matchMedia?.('(prefers-reduced-motion: reduce)')||null;"),'preferência de movimento reduzido deve reutilizar MediaQueryList');
expect(globalPerf.includes('if(settleFrame)cancelAnimationFrame(settleFrame);'),'settle visual deve coalescer frames pendentes');
expect(globalPerf.includes('if(document.hidden&&settleFrame){cancelAnimationFrame(settleFrame);settleFrame=0;}'),'frame pendente deve ser cancelado ao ocultar a página');
expect(globalPerf.includes('function bindCapabilityChanges()'),'mudanças de capacidade devem atualizar classes sem polling');
expect(globalPerf.includes("navigator.connection?.addEventListener?.('change',syncCapabilityClasses)"),'Save-Data/conexão deve atualizar a classe global por evento');
expect(globalPerf.includes("version:'10.10.9-perf3'"),'versão global de performance deve identificar a revisão nova');
expect(!/setInterval\s*\(/.test(globalPerf+desktop),'otimização de runtime não deve introduzir polling');

if(!process.exitCode)console.log('OK runtime performance hygiene');
