// Cron-only bridge: reads Firestore feedback, verifies the student link, and sends FCM data notices.
// No public endpoint accepts notifications or device tokens.
const PROJECT = 'teamms-app';
const DOCUMENTS = `projects/${PROJECT}/databases/(default)/documents`;
const FIRESTORE = `https://firestore.googleapis.com/v1/${DOCUMENTS}`;
const FCM = `https://fcm.googleapis.com/v1/projects/${PROJECT}/messages:send`;
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TYPES = new Set(['weekly_report', 'monthly_full', 'weekly_diet', 'weekly_training', 'extra']);
const QUERY_LIMIT = 20;
const DELIVERY_LIMIT = 2;
const DEVICE_PAGE_SIZE = 15;
let cachedAuth;

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const encoded = value => b64url(new TextEncoder().encode(JSON.stringify(value)));
const account = env => {
  const data = JSON.parse(env.SERVICE_ACCOUNT_JSON || '{}');
  if (data.project_id !== PROJECT || data.token_uri !== TOKEN_URI || !data.client_email || !data.private_key)
    throw new Error('Credencial de serviço ausente ou fora do projeto teamms-app.');
  return data;
};

async function accessToken(env, fetcher) {
  if (cachedAuth && cachedAuth.expires > Date.now() + 60_000) return cachedAuth.token;
  const data = account(env), now = Math.floor(Date.now() / 1000);
  const pem = data.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const claim = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded({
    iss: data.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    aud: TOKEN_URI, iat: now, exp: now + 3600
  })}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(claim)));
  const response = await fetcher(TOKEN_URI, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${claim}.${b64url(signature)}` })
  });
  if (!response.ok) throw new Error(`Falha na autenticação Google (${response.status}).`);
  const body = await response.json();
  if (!body.access_token || !Number(body.expires_in)) throw new Error('Resposta de autenticação incompleta.');
  cachedAuth = { token: body.access_token, expires: Date.now() + Number(body.expires_in) * 1000 };
  return cachedAuth.token;
}

async function googleJson(url, token, fetcher, options = {}) {
  const response = await fetcher(url, {
    ...options, headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}) }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Serviço Google indisponível (${response.status}).`);
  return response.json();
}

export function feedbackQuery(cursor) {
  const values = [{ timestampValue: cursor.created_at }];
  if (cursor.document_name) values.push({ referenceValue: cursor.document_name });
  return { structuredQuery: {
    from: [{ collectionId: 'feedback' }],
    select: { fields: ['studentId', 'trainerId', 'feedbackType', 'createdAt'].map(fieldPath => ({ fieldPath })) },
    orderBy: ['createdAt', '__name__'].map(fieldPath => ({ field: { fieldPath }, direction: 'ASCENDING' })),
    startAt: { values, before: false }, limit: QUERY_LIMIT
  } };
}

async function ingest(db, token, fetcher) {
  const cursor = await db.prepare('SELECT created_at, document_name FROM cursor_state WHERE id = 1').first();
  if (!cursor) throw new Error('Migração D1 ainda não aplicada; nenhuma notificação foi enviada.');
  const rows = await googleJson(`${FIRESTORE}:runQuery`, token, fetcher,
    { method: 'POST', body: JSON.stringify(feedbackQuery(cursor)) });
  const documents = rows.filter(row => row.document?.name && row.document.fields?.createdAt?.timestampValue).map(row => row.document);
  if (!documents.length) return;
  const statements = documents.map(doc => db.prepare(`INSERT OR IGNORE INTO feedback_outbox
    (feedback_id, student_id, trainer_id, feedback_type, created_at) VALUES (?, ?, ?, ?, ?)`).bind(
      doc.name.slice(doc.name.lastIndexOf('/') + 1),
      doc.fields.studentId?.stringValue || '', doc.fields.trainerId?.stringValue || '',
      TYPES.has(doc.fields.feedbackType?.stringValue) ? doc.fields.feedbackType.stringValue : 'extra',
      doc.fields.createdAt.timestampValue));
  const last = documents.at(-1);
  statements.push(db.prepare('UPDATE cursor_state SET created_at = ?, document_name = ? WHERE id = 1')
    .bind(last.fields.createdAt.timestampValue, last.name));
  // An outbox insert and cursor advance must commit together, or a feedback can be lost.
  await db.batch(statements);
}

const docValue = (doc, field) => doc?.fields?.[field]?.stringValue || '';
const validLink = (user, item) => docValue(user, 'role') === 'student'
  && docValue(user, 'status') === 'active' && docValue(user, 'trainerId') === item.trainer_id;

async function deliverOne(db, item, token, fetcher) {
  if (!item.student_id || !item.trainer_id) {
    await db.prepare("UPDATE feedback_outbox SET status = 'ignored' WHERE feedback_id = ?").bind(item.feedback_id).run();
    return;
  }
  const user = await googleJson(`${FIRESTORE}/users/${encodeURIComponent(item.student_id)}`, token, fetcher);
  if (!validLink(user, item)) {
    await db.prepare("UPDATE feedback_outbox SET status = 'ignored' WHERE feedback_id = ?").bind(item.feedback_id).run();
    return;
  }
  const path = `pushDevices/${encodeURIComponent(item.student_id)}/tokens`;
  const url = new URL(`${FIRESTORE}/${path}`);
  url.searchParams.set('pageSize', String(DEVICE_PAGE_SIZE));
  if (item.page_token) url.searchParams.set('pageToken', item.page_token);
  const devices = await googleJson(url.href, token, fetcher);
  if (!devices) throw new Error('A lista de aparelhos não está disponível.');
  for (const doc of devices.documents || []) {
    const deviceId = doc.name?.slice(doc.name.lastIndexOf('/') + 1);
    if (!deviceId) continue;
    const done = await db.prepare('SELECT status FROM feedback_delivery WHERE feedback_id = ? AND device_id = ?')
      .bind(item.feedback_id, deviceId).first();
    if (done) continue;
    const deviceToken = docValue(doc, 'token');
    if (!deviceToken) {
      await db.prepare("INSERT OR IGNORE INTO feedback_delivery VALUES (?, ?, 'invalid')").bind(item.feedback_id, deviceId).run();
      continue;
    }
    const response = await fetcher(FCM, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: deviceToken, data: {
        kind: 'feedback', feedbackId: item.feedback_id, feedbackType: item.feedback_type
      }, webpush: { headers: { TTL: '86400', Urgency: 'high' } } } })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const fcmError = error.error?.details?.find(detail => detail['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError')?.errorCode;
      if (fcmError !== 'UNREGISTERED') throw new Error(`FCM indisponível (${response.status}).`);
      await db.prepare("INSERT OR IGNORE INTO feedback_delivery VALUES (?, ?, 'invalid')").bind(item.feedback_id, deviceId).run();
    } else {
      await db.prepare("INSERT OR IGNORE INTO feedback_delivery VALUES (?, ?, 'sent')").bind(item.feedback_id, deviceId).run();
    }
  }
  await db.prepare('UPDATE feedback_outbox SET page_token = ?, status = ?, attempts = 0, next_attempt_at = 0 WHERE feedback_id = ?')
    .bind(devices.nextPageToken || '', devices.nextPageToken ? 'pending' : 'done', item.feedback_id).run();
}

async function deliver(db, token, fetcher) {
  const ready = await db.prepare("SELECT * FROM feedback_outbox WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at, feedback_id LIMIT ?")
    .bind(Date.now(), DELIVERY_LIMIT).all();
  for (const item of ready.results || []) {
    try { await deliverOne(db, item, token, fetcher); }
    catch (error) {
      const wait = Math.min(3_600_000, 60_000 * 2 ** Math.min(item.attempts || 0, 6));
      await db.prepare('UPDATE feedback_outbox SET attempts = attempts + 1, next_attempt_at = ? WHERE feedback_id = ?')
        .bind(Date.now() + wait, item.feedback_id).run();
      console.error('Falha no envio de feedback; tentativa futura agendada:', error.message);
    }
  }
}

export async function run(env, fetcher = fetch) {
  if (!env.DB) throw new Error('Banco D1 não configurado.');
  const token = await accessToken(env, fetcher);
  await ingest(env.DB, token, fetcher);
  await deliver(env.DB, token, fetcher);
  // Bounded retention keeps D1 free storage from growing forever.
  await env.DB.prepare(`DELETE FROM feedback_outbox WHERE feedback_id IN (
    SELECT feedback_id FROM feedback_outbox WHERE status IN ('done', 'ignored')
    AND created_at < ? ORDER BY created_at LIMIT 100
  )`).bind(new Date(Date.now() - 90 * 86400_000).toISOString()).run();
}

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
  async scheduled(_event, env) { await run(env); }
};
