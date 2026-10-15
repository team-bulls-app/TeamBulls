import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { feedbackQuery, run } from '../cloudflare-feedback-push/src/index.mjs';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = db => ({ DB: db, SERVICE_ACCOUNT_JSON: JSON.stringify({
  project_id: 'teamms-app', client_email: 'notices@teamms-app.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.googleapis.com/token',
  private_key: privateKey.export({ format: 'pem', type: 'pkcs8' })
}) });
const result = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const name = id => `projects/teamms-app/databases/(default)/documents/feedback/${id}`;
const feedback = (id, studentId, trainerId, type, at) => ({ name: name(id), fields: {
  studentId: { stringValue: studentId }, trainerId: { stringValue: trainerId },
  feedbackType: { stringValue: type }, createdAt: { timestampValue: at },
  message: { stringValue: 'conteúdo sigiloso que não pode ir ao push' }
} });

class FakeD1 {
  constructor() { this.cursor = { created_at: '2026-09-29T00:00:00.000Z', document_name: '' }; this.outbox = new Map(); this.deliveries = new Map(); this.failBatch = false; }
  prepare(sql) {
    const db = this;
    return { sql, args: [], bind(...args) { this.args = args; return this; },
      async first() {
        if (sql.includes('FROM cursor_state')) return { ...db.cursor };
        if (sql.includes('FROM feedback_delivery')) return db.deliveries.get(`${this.args[0]}:${this.args[1]}`) || null;
        throw new Error(`Unexpected first: ${sql}`);
      },
      async all() {
        if (!sql.includes('FROM feedback_outbox')) throw new Error(`Unexpected all: ${sql}`);
        return { results: [...db.outbox.values()].filter(row => row.status === 'pending' && row.next_attempt_at <= this.args[0])
          .sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, this.args[1]).map(row => ({ ...row })) };
      },
      async run() {
        const a = this.args;
        if (sql.includes('INSERT OR IGNORE INTO feedback_outbox')) {
          if (!db.outbox.has(a[0])) db.outbox.set(a[0], { feedback_id: a[0], student_id: a[1], trainer_id: a[2], feedback_type: a[3], created_at: a[4], page_token: '', next_attempt_at: 0, attempts: 0, status: 'pending' });
        } else if (sql.includes('UPDATE cursor_state')) db.cursor = { created_at: a[0], document_name: a[1] };
        else if (sql.includes("SET status = 'ignored'")) db.outbox.get(a[0]).status = 'ignored';
        else if (sql.includes('INSERT OR IGNORE INTO feedback_delivery')) db.deliveries.set(`${a[0]}:${a[1]}`, { status: sql.includes("'sent'") ? 'sent' : 'invalid' });
        else if (sql.includes('SET page_token =')) Object.assign(db.outbox.get(a[2]), { page_token: a[0], status: a[1], attempts: 0, next_attempt_at: 0 });
        else if (sql.includes('SET attempts = attempts + 1')) Object.assign(db.outbox.get(a[1]), { attempts: db.outbox.get(a[1]).attempts + 1, next_attempt_at: a[0] });
        else if (sql.includes('DELETE FROM feedback_outbox')) {
          for (const [id, item] of db.outbox) if (item.status !== 'pending' && item.created_at < a[0]) db.outbox.delete(id);
        }
        else throw new Error(`Unexpected run: ${sql}`);
      }
    };
  }
  async batch(statements) {
    if (this.failBatch) throw new Error('transaction failed');
    for (const statement of statements) await statement.run();
  }
}

const db = new FakeD1();
const docs = [
  feedback('one', 'student-a', 'trainer-a', 'weekly_diet', '2026-09-29T00:01:00Z'),
  feedback('two', 'student-b', 'former-trainer', 'monthly_full', '2026-09-29T00:02:00Z')
];
const sent = [], queried = [];
let failSend = true;
const fetcher = async (url, options = {}) => {
  if (url === 'https://oauth2.googleapis.com/token') {
    const assertion = new URLSearchParams(options.body).get('assertion');
    assert.equal(assertion.split('.').length, 3, 'Google credential is signed rather than exposed');
    return result({ access_token: 'test-access', expires_in: 3600 });
  }
  assert.equal(options.headers?.authorization, 'Bearer test-access');
  if (url.endsWith(':runQuery')) {
    const query = JSON.parse(options.body).structuredQuery;
    queried.push(query);
    assert.deepEqual(query.select.fields.map(item => item.fieldPath), ['studentId', 'trainerId', 'feedbackType', 'createdAt']);
    return result(docs.map(document => ({ document })));
  }
  if (url.endsWith('/users/student-a')) return result({ fields: {
    role: { stringValue: 'student' }, status: { stringValue: 'active' }, trainerId: { stringValue: 'trainer-a' }
  } });
  if (url.endsWith('/users/student-b')) return result({ fields: {
    role: { stringValue: 'student' }, status: { stringValue: 'active' }, trainerId: { stringValue: 'new-trainer' }
  } });
  if (url.includes('/pushDevices/student-a/tokens')) return result({ documents: [
    { name: 'projects/teamms-app/databases/(default)/documents/pushDevices/student-a/tokens/device-1', fields: { token: { stringValue: 'token-a' } } },
    { name: 'projects/teamms-app/databases/(default)/documents/pushDevices/student-a/tokens/device-2', fields: { token: { stringValue: 'token-b' } } }
  ] });
  if (url.includes('/messages:send')) {
    const payload = JSON.parse(options.body);
    sent.push(payload);
    assert.equal(JSON.stringify(payload).includes('conteúdo sigiloso'), false);
    if (failSend && payload.message.token === 'token-b') return result({ error: { status: 'UNAVAILABLE' } }, 503);
    return result({ name: 'projects/teamms-app/messages/123' });
  }
  throw new Error(`Unexpected fetch: ${url}`);
};

assert.equal(feedbackQuery(db.cursor).structuredQuery.startAt.values.length, 1);
db.failBatch = true;
await assert.rejects(run(env(db), fetcher), /transaction failed/);
assert.equal(db.cursor.document_name, '', 'a failed transaction must not advance the cursor');
db.failBatch = false;
await run(env(db), fetcher);
assert.equal(db.cursor.document_name, name('two'));
assert.equal(sent.length, 2, 'trainer mismatch must never send');
assert.equal(db.outbox.get('two').status, 'ignored');
assert.equal(db.outbox.get('one').status, 'pending', 'transient FCM error must retry');
assert.equal(db.outbox.get('one').attempts, 1);
assert.equal(db.deliveries.get('one:device-1').status, 'sent');
db.outbox.get('one').next_attempt_at = 0;
failSend = false;
await run(env(db), fetcher);
assert.equal(db.outbox.get('one').status, 'done');
assert.equal(db.deliveries.get('one:device-1').status, 'sent');
assert.equal(db.deliveries.get('one:device-2').status, 'sent');
assert.equal(sent.length, 3, 'a retry must not re-send to a successful device');
assert.equal(queried.at(-1).startAt.values[1].referenceValue, name('two'), 'cursor must include document ID');
assert.equal(sent.at(-1).message.data.feedbackType, 'weekly_diet');
console.log('APROVADO — Cloudflare: cursor transacional, isolamento do aluno, conteúdo privado e retry.');
