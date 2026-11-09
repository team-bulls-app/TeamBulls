import assert from 'node:assert/strict';import {createRequire} from 'node:module';
// Demo configuration plus closed local emulator endpoints: this smoke test
// must never discover credentials or address a production Firebase project.
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-team-bulls',storageBucket:'demo-team-bulls.appspot.com'});
process.env.GCLOUD_PROJECT='demo-team-bulls';process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:9';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9';
const functions=createRequire(import.meta.url)('../functions/index.js');
assert.equal(typeof functions.studentAdministration,'function');assert.equal(typeof functions.notifyNewFeedback,'function');
assert.equal(functions.studentAdministration.__endpoint.platform,'gcfv2');assert.equal(functions.studentAdministration.__endpoint.maxInstances,2);
await assert.rejects(functions.studentAdministration.run({auth:{uid:'synthetic'},app:{appId:'synthetic'},rawRequest:{headers:{authorization:'Bearer invalid'}},data:{action:'delete',studentUid:'s'}}),error=>error.code==='unauthenticated');
console.log('PASS installed Firebase SDK smoke: callable and feedback trigger register, resource limits survive binding, invalid identity is rejected before any data access. No production credentials used.');
