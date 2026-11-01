'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const boot = fs.readFileSync(path.join(root, 'boot_v10.js'), 'utf8');
const start = boot.indexOf('// BEGIN LOGIN ACCOUNT PICKER BOOTSTRAP');
const end = boot.indexOf('// END LOGIN ACCOUNT PICKER BOOTSTRAP', start);
assert.ok(start >= 0 && end > start, 'O seletor de contas precisa estar no boot inicial, antes dos módulos opcionais.');

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.focusCount = 0;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  insertAdjacentElement(position, element) {
    assert.equal(position, 'afterend');
    this.after = element;
    this.ownerDocument.elements.set(element.id, element);
  }
  closest(selector) { return selector === '.form-group' ? this.formGroup : null; }
  remove() { this.removed = true; this.ownerDocument.elements.delete(this.id); }
  focus() { this.focusCount += 1; }
  dispatchEvent(event) {
    event.target = this;
    (this.listeners[event.type] || []).forEach(listener => listener.call(this, event));
    return true;
  }
  click() { (this.listeners.click || []).forEach(listener => listener.call(this, { type: 'click', target: this })); }
}

class FakeEvent {
  constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
}

const saved = ['Murilo@example.com', 'student.two@example.com'];
const values = new Map([
  ['team_bulls_known_accounts_v1', JSON.stringify(saved)],
  ['team_bulls_offline_credentials', JSON.stringify({
    one: { email: 'murilo@example.com', password: 'must-never-render' },
    two: { email: 'student.three@example.com', password: 'also-private' }
  })]
]);
const localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); }
};
const document = {
  readyState: 'loading',
  visibilityState: 'visible',
  documentElement: {},
  elements: new Map(),
  listeners: {},
  getElementById(id) { return this.elements.get(id) || null; },
  createElement(tag) { return new FakeElement(tag, this); },
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
};
const window = { listeners: {}, addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); } };
let mutationObserver;
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; mutationObserver = this; }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
}
const loginError = new FakeElement('div', document);
loginError.id = 'login-error';
loginError.className = 'auth-error show';
loginError.textContent = 'A restauração da sessão demorou. Você já pode entrar novamente; seus dados continuam preservados.';
document.elements.set(loginError.id, loginError);

let selectedAccount='';
vm.runInNewContext(boot.slice(start, end), { window, document, localStorage, Event: FakeEvent, MutationObserver: FakeMutationObserver,
  loginWithSavedDeviceAccount:email=>{selectedAccount=email;}
});

assert.equal(typeof window.TeamBullsKnownAccounts?.render, 'function', 'O seletor precisa existir antes da restauração Firebase.');
assert.ok(mutationObserver, 'O boot precisa observar a montagem do formulário sem esperar os módulos opcionais.');
assert.equal(mutationObserver.target, document.documentElement);
assert.equal(mutationObserver.options.subtree, true);

const group = new FakeElement('div', document);
const email = new FakeElement('input', document);
email.id = 'login-email';
email.value = 'murilo@example.com';
email.formGroup = group;
group.ownerDocument = document;
const pass = new FakeElement('input', document);
pass.id = 'login-pass';
document.elements.set(email.id, email);
document.elements.set(pass.id, pass);

mutationObserver.callback();
const host = document.getElementById('tb-known-accounts');
assert.ok(host, 'A lista deve aparecer assim que o formulário entra no DOM, inclusive com aviso de sessão.');
assert.equal(mutationObserver.disconnected, true);
assert.equal(loginError.textContent, 'A restauração da sessão demorou. Você já pode entrar novamente; seus dados continuam preservados.');
assert.equal(host.children[0].textContent, 'Contas neste aparelho');
const buttons = host.children[1].children;
assert.deepEqual(buttons.map(button => button.textContent), [
  'murilo@example.com',
  'student.two@example.com',
  'student.three@example.com'
]);
assert.ok(buttons.every(button => !button.textContent.includes('private')), 'Nenhuma senha pode ser exibida no seletor.');
assert.equal(buttons[0].className, 'tb-known-account active');

pass.value='senha-de-outra-conta';
buttons[2].click();
assert.equal(email.value, 'student.three@example.com', 'Tocar em uma conta precisa preencher o e-mail.');
assert.equal(pass.focusCount, 0, 'Escolher uma conta não pode abrir o gerenciador de senhas.');
assert.equal(pass.value, '', 'Trocar a conta precisa limpar qualquer senha anterior.');
assert.equal(selectedAccount, 'student.three@example.com', 'O seletor deve tentar o acesso salvo para a conta escolhida.');
assert.equal(document.getElementById('tb-known-accounts').children[1].children[2].className, 'tb-known-account active');

for (let i = 0; i < 10; i += 1) window.TeamBullsKnownAccounts.remember('new' + i + '@example.com');
const persisted = JSON.parse(values.get('team_bulls_known_accounts_v1'));
assert.equal(persisted.length, 8, 'A memória de contas mantém o limite seguro de oito endereços.');
assert.equal(persisted[0], 'new9@example.com', 'A conta usada mais recentemente fica primeiro.');
assert.ok(persisted.every(value => value.includes('@') && !value.includes('private')));
assert.ok(window.listeners.pageshow?.length, 'A lista se atualiza ao reabrir a PWA.');
assert.ok(window.listeners.storage?.length, 'A lista acompanha mudanças de armazenamento em outras abas.');

console.log('APROVADO — contas salvas aparecem no boot durante fail-open, sem depender do módulo adiado nem expor senhas.');