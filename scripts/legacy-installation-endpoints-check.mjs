import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {root,inventory,expectedFiles,legacyManifest} from './legacy-installation-endpoints.mjs';

const canonical=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const scope='https://team-bulls-app.github.io/TeamBulls/';
const names=new Set();
for(const [name,expected] of expectedFiles()){
  assert(!names.has(name),'Duplicate historical endpoint: '+name);names.add(name);
  assert(fs.existsSync(path.join(root,name)),`Previously published endpoint was removed: ${name}`);
  const actual=fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
  assert.equal(actual,expected,`Compatibility endpoint diverged: ${name}`);
  if(name.endsWith('.js')){
    const imports=[];vm.runInNewContext(actual,{importScripts:(...args)=>imports.push(...args)});
    assert.deepEqual(imports,['./sw.js'],`Old installer must reach the canonical worker: ${name}`);
  }else{
    const entry=inventory.manifests.find(item=>item.path===name),manifest=JSON.parse(actual);
    assert.deepEqual(manifest,legacyManifest(entry,canonical));
    assert.equal(new URL(manifest.id,scope).href,new URL(entry.id,scope).href);
    assert.equal(manifest.start_url,entry.start_url,'An installed launch URL must remain stable.');
    for(const icon of manifest.icons)assert(fs.existsSync(path.join(root,icon.src)),`Missing installer icon: ${icon.src}`);
  }
}
assert.equal(inventory.workers.length,27,'Historical audit recorded 27 deleted worker endpoints.');
assert.equal(inventory.manifests.length,18,'Historical audit recorded 18 deleted manifests.');
for(const required of ['sw_3.js','sw_15.js','sw_40.js','sw_44.js','sw_46.js','manifest_4.json','manifest_13.json','manifest_33.json'])assert(names.has(required));
assert.equal(canonical.id,'./','The active app identity must remain stable.');
assert.equal(canonical.start_url,'./index.html');
assert.equal(canonical.scope,'./');
console.log(`PASS ${names.size} historical endpoints: canonical worker delivery, stable app identity/launch URLs and valid icons.`);
