import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const inventory=JSON.parse(fs.readFileSync(path.join(root,'config/legacy-installation-endpoints.json'),'utf8'));
export const workerBridge="/* Compatibilidade permanente com instalações antigas do Team Bulls. */\n'use strict';\nimportScripts('./sw.js');\n";
export function legacyManifest(entry,canonical){
  // Keep the identity and launch URL already saved by each historical installer.
  return {...canonical,id:entry.id,start_url:entry.start_url,scope:entry.scope};
}
export function expectedFiles(){
  const canonical=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  return [...inventory.workers.map(entry=>[entry.path,workerBridge]),
    ...inventory.manifests.map(entry=>[entry.path,JSON.stringify(legacyManifest(entry,canonical),null,2)+'\n'])];
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  for(const [name,content] of expectedFiles()){
    if(!/^(?:sw_\d+\.js|manifest_\d+\.json)$/.test(name))throw new Error('Invalid historical endpoint: '+name);
    fs.writeFileSync(path.join(root,name),content);
  }
  console.log(`Restored ${inventory.workers.length} historical workers and ${inventory.manifests.length} installers.`);
}
