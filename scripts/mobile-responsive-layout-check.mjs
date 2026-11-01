import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('styles_v10_10_9.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const failures=[];
const has=(text,needle,message)=>{if(!text.includes(needle))failures.push(message);};

has(css,'@media(max-width:899px)','Ajustes para celulares e tablets pequenos estão ausentes.');
has(css,'@media(max-width:520px)','Ajustes para telefones estreitos estão ausentes.');
has(css,'@media(max-width:350px)','Ajustes para telas muito estreitas estão ausentes.');
has(css,'var(--safe-top,0px)','Cabeçalho não respeita a área segura superior do iPhone.');
has(css,'var(--safe-bottom,0px)','Navegação inferior não respeita a área segura inferior do celular.');
has(css,'min-width:0','Cabeçalhos móveis ainda podem forçar largura e criar estouro horizontal.');
for(const [key,label] of [['home','INÍCIO'],['workout','TREINO'],['diet','SUPRIM.'],['instructions','INSTR.'],['payments','PAGAM.'],['options','OPÇÕES'],['reports','RELAT.']]){
  has(css,`[data-hotbar="${key}"] span::after{content:'${label}'}`,`Rótulo compacto da aba ${label} não está presente.`);
}
has(css,'appearance:auto!important','Seletores do catálogo não usam controles nativos legíveis.');
has(css,'-webkit-text-fill-color:var(--paper)','Texto dos seletores pode continuar invisível no WebKit/iOS.');
has(html,'aria-label="Grupo de exercícios"','Primeiro seletor do catálogo não possui rótulo acessível.');
has(html,'aria-label="Exercício do catálogo"','Segundo seletor do catálogo não possui rótulo acessível.');

if(failures.length){console.error('FALHA — responsividade móvel\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — layout móvel respeita safe areas, telas estreitas e legibilidade dos controles.');
