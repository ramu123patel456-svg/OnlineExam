const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Firebase is optional for local development. If Admin credentials are present,
// the real Firestore is used. Otherwise a small JSON-backed Firestore-compatible
// adapter is used so `npm start` works immediately without credentials.
let enabled = false;
let db = null;
let initError = null;
let localMode = false;

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) return JSON.parse(raw);
  const configuredPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const candidates = [
    configuredPath && path.resolve(configuredPath),
    path.join(__dirname, 'serviceAccountKey.json'),
    path.join(__dirname, 'service-account.json'),
    path.join(__dirname, 'serviceAccount.json')
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

const LOCAL_DB_FILE = path.join(__dirname, 'data', 'local-firestore.json');
function readLocal() {
  try { return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8')); }
  catch { return {}; }
}
function writeLocal(data) {
  fs.mkdirSync(path.dirname(LOCAL_DB_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(data, null, 2));
}
function getPathValue(obj, field) {
  return String(field).split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
}
function localDoc(collection, id) {
  return {
    id,
    get: async () => {
      const data = readLocal();
      const value = data[collection]?.[id];
      return { id, exists: value !== undefined, data: () => value };
    },
    set: async (value, options = {}) => {
      const data = readLocal(); data[collection] ||= {};
      data[collection][id] = options.merge ? { ...(data[collection][id] || {}), ...value } : value;
      writeLocal(data);
    },
    update: async (value) => {
      const data = readLocal(); data[collection] ||= {};
      if (!data[collection][id]) throw new Error(`Document ${collection}/${id} does not exist.`);
      data[collection][id] = { ...data[collection][id], ...value }; writeLocal(data);
    },
    delete: async () => {
      const data = readLocal(); if (data[collection]) delete data[collection][id]; writeLocal(data);
    }
  };
}
function localQuery(collection, filters = [], max = null) {
  let docs = Object.entries(readLocal()[collection] || {}).map(([id, value]) => ({ id, ...value }));
  for (const f of filters) docs = docs.filter(d => getPathValue(d, f.field) === f.value);
  if (max) docs = docs.slice(0, max);
  return { empty: docs.length === 0, docs: docs.map(d => ({ id: d.id, data: () => { const x = { ...d }; delete x.id; return x; } })) };
}
function localCollection(name) {
  const query = (filters = [], max = null) => ({
    get: async () => localQuery(name, filters, max),
    limit: n => query(filters, Number(n)),
    where: (field, op, value) => {
      if (op !== '==') throw new Error('Local fallback supports only == queries.');
      return query([...filters, { field, value }], max);
    }
  });
  return {
    get: async () => localQuery(name),
    limit: n => query([], Number(n)),
    where: (field, op, value) => {
      if (op !== '==') throw new Error('Local fallback supports only == queries.');
      return query([{ field, value }]);
    },
    doc: id => localDoc(name, String(id)),
    add: async value => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await localDoc(name, id).set(value);
      return { id, ...localDoc(name, id) };
    }
  };
}
function createLocalDb() {
  return {
    collection: name => localCollection(name),
    batch: () => {
      const ops = [];
      return {
        set: (ref, value, options) => ops.push(() => ref.set(value, options)),
        update: (ref, value) => ops.push(() => ref.update(value)),
        delete: ref => ops.push(() => ref.delete()),
        commit: async () => { for (const op of ops) await op(); }
      };
    }
  };
}

try {
  const serviceAccount = loadServiceAccount();
  if (serviceAccount && !admin.apps.length) {
    // Firebase Admin SDK: service account credentials are loaded from
    // FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or a
    // local server/serviceAccountKey.json file.
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  if (admin.apps.length) {
    db = admin.firestore(); enabled = true;
    console.log('Firebase/Firestore: connected');
  } else {
    db = createLocalDb(); enabled = true; localMode = true;
    console.log('Firebase credentials not found — using local JSON database for development.');
  }
} catch (err) {
  initError = err;
  db = createLocalDb(); enabled = true; localMode = true;
  console.warn('Firebase initialization failed — using local JSON database instead:', err.message);
}

function requireFirebase() { return db; }
module.exports = { admin, db, enabled, localMode, initError, requireFirebase };
