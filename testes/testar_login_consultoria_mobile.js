'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const css = read('styles_v10_10_9.css');
const worker = read('sw.js');
const bridge = read('sw_47.js');
const updater = read('update_v10_10_9.js');
const version = JSON.parse(read('version.json'));
const imagePath = path.join(root, 'team-bulls-consultoria-bg-v1.jpg');
const cssUrl = 'styles_v10_10_9.css?v=10.10.9&theme=light14&exercise=groupcontrols1&support=diagnostics1&login=sessionquickpick1&mobile=responsive2&catalog=picker2&desktop=login-minotaurs1&device=local-access1';
const bootUrl = 'boot_v10.js?v=10.10.9-themefirstpaint2&login=device-access1';
const mobileStyles = css.slice(css.indexOf('/* Login mobile: portal de consultoria'));

assert.match(html, /class="auth-logo">TEAM <span class="dim">BULLS<\/span><\/div>/);
assert.doesNotMatch(html, /class="auth-intro"|Evolução com|Treinos e planos organizados/);
assert.match(html, /Acesse sua consultoria/);
assert.match(html, /id="tab-login" onclick="authTab\('login'\)"/);
assert.match(html, /id="tab-register" onclick="authTab\('register'\)"/);
assert.match(html, /id="panel-login" onsubmit="event\.preventDefault\(\);doLogin\(\)"/);
assert.match(html, /id="panel-register" onsubmit="event\.preventDefault\(\);doRegister\(\)"/);
assert.match(html, /id="login-email"[\s\S]*?id="login-pass"/);
assert.match(html, /id="btn-login" onclick="doLogin\(\)"/);
assert.match(html, /id="btn-forgot-password" onclick="openPasswordReset\(\)"/);

assert.match(mobileStyles, /@media\(max-width:899px\)/);
assert.match(mobileStyles, /overflow-y:auto/);
assert.match(mobileStyles, /#screen-auth \.auth-logo\{[\s\S]*?text-align:center;[\s\S]*?font-family:'Barlow Condensed','Arial Narrow',sans-serif;[\s\S]*?font-size:clamp\(42px,11vw,48px\)/);
assert.match(mobileStyles, /#screen-auth \.auth-logo::before\{content:none\}/);
assert.match(mobileStyles, /#screen-auth \.auth-sub\{display:none\}/);
assert.match(mobileStyles, /safe-area-inset-(top|bottom)/);
assert.match(mobileStyles, /url\('team-bulls-consultoria-bg-v1\.jpg'\)/);
assert.match(mobileStyles, /@media\(max-width:899px\) and \(max-height:740px\)/);
assert.match(mobileStyles, /html\[data-theme="light"\] #screen-auth\.active/);
assert.ok(fs.statSync(imagePath).size > 30_000, 'O fundo mobile deve existir como imagem distribuível.');

assert.ok(html.includes(cssUrl), 'O HTML precisa solicitar a revisão nova do CSS mobile.');
assert.equal(html.split(cssUrl).length - 1, 2, 'Preload e stylesheet precisam solicitar a mesma revisão do CSS.');
assert.ok(worker.includes(`'./${cssUrl}'`), 'O Service Worker principal precisa armazenar a mesma revisão do CSS do HTML.');
assert.equal(worker.split(`'./${cssUrl}'`).length - 1, 2, 'Shell e ativação precisam pré-carregar a mesma revisão do CSS.');
assert.ok(updater.includes(`'./${cssUrl}'`), 'A atualização manual precisa renovar a mesma revisão do CSS do HTML.');
assert.equal(bridge, worker, 'Os Service Workers principal e legado precisam entregar os mesmos assets.');
assert.ok(worker.includes("'./team-bulls-consultoria-bg-v1.jpg'"), 'O fundo deve entrar no cache de shell do Service Worker.');
assert.ok(updater.includes("'./team-bulls-consultoria-bg-v1.jpg'"), 'A atualização manual precisa renovar a imagem do fundo.');
assert.equal(Number(worker.match(/const BUILD_REVISION=(\d+)/)?.[1]), Number(version.build));
assert.equal(Number(bridge.match(/const BUILD_REVISION=(\d+)/)?.[1]), Number(version.build));
assert.equal(Number(updater.match(/const CURRENT_BUILD=(\d+)/)?.[1]), Number(version.build));

const knownAccountsCss = css.slice(css.indexOf('.tb-known-accounts{'), css.indexOf('/* Login mobile: portal de consultoria'));
assert.ok(knownAccountsCss.includes('.tb-known-account.active{'), 'Os atalhos de conta precisam estar estilizados no CSS crítico.');
assert.match(mobileStyles, /justify-content:center/, 'O formulário curto deve ficar centralizado quando houver espaço vertical.');
assert.ok(html.includes(bootUrl), 'O HTML precisa solicitar o bootstrap atualizado antes do app.');
assert.ok(worker.includes("'./" + bootUrl + "'"), 'O Service Worker precisa armazenar a mesma revisão do bootstrap.');
assert.ok(updater.includes("'./" + bootUrl + "'"), 'A atualização manual precisa renovar a mesma revisão do bootstrap.');
console.log('APROVADO: layout mobile, contas rápidas no bootstrap e entrega/cache dos assets estão coerentes.');
