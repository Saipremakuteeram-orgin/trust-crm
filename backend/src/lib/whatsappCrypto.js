const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SESSION_DIR = path.join(__dirname, '..', '..', '.wa-sessions');
const SECRET_NAME = process.env.WA_SESSION_KEY_SECRET_NAME || 'trust-crm-wa-session-encryption-key';
let encryptionKey = null;
let encryptionKeySource = null;
let initializationPromise = null;

function normalizeEncryptionKey(rawValue) {
  const value = String(rawValue || '').trim();
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');

  const decoded = Buffer.from(value, 'base64');
  const normalizedValue = value.replace(/=+$/, '');
  const normalizedDecoded = decoded.toString('base64').replace(/=+$/, '');
  if (decoded.length === 32 && normalizedValue === normalizedDecoded) return decoded;

  throw new Error('WhatsApp encryption secret must be a 64-character hex key or base64-encoded 32-byte key');
}

function normalizedPrivateKey() {
  return String(process.env.GOOGLE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function inferGoogleProjectId() {
  if (process.env.GOOGLE_CLOUD_PROJECT_ID) return process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (process.env.GOOGLE_PROJECT_ID) return process.env.GOOGLE_PROJECT_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  return email.match(/@([^.]+)\.iam\.gserviceaccount\.com$/)?.[1] || '';
}

async function loadFromGoogleSecretManager() {
  const projectId = inferGoogleProjectId();
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizedPrivateKey();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'WA_SESSION_ENCRYPTION_KEY is missing. Configure Google Secret Manager with GOOGLE_CLOUD_PROJECT_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and WA_SESSION_KEY_SECRET_NAME'
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const secretManager = google.secretmanager({ version: 'v1', auth });
  const response = await secretManager.projects.secrets.versions.access({
    name: `projects/${projectId}/secrets/${SECRET_NAME}/versions/latest`,
  });
  const encodedSecret = response.data?.payload?.data;
  if (!encodedSecret) throw new Error(`Google Secret Manager returned no payload for ${SECRET_NAME}`);
  return Buffer.from(encodedSecret, 'base64').toString('utf8').trim();
}

async function initializeEncryptionKey() {
  if (encryptionKey) return encryptionKey;
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const environmentValue = process.env.WA_SESSION_ENCRYPTION_KEY;
      const rawValue = environmentValue || await loadFromGoogleSecretManager();
      encryptionKey = normalizeEncryptionKey(rawValue);
      encryptionKeySource = environmentValue ? 'environment' : `google-secret-manager:${SECRET_NAME}`;
      console.log(`[whatsappCrypto] encryption key loaded from ${encryptionKeySource}`);
      return encryptionKey;
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

function requireEncryptionKey() {
  if (!encryptionKey) {
    throw new Error('WhatsApp encryption key has not been initialized');
  }
  return encryptionKey;
}

function getEncryptionStatus() {
  return { initialized: Boolean(encryptionKey), source: encryptionKeySource };
}

function ensureDir() {
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch (err) {
    console.error('[whatsappCrypto] failed to create session dir:', err.message);
  }
}

function encryptData(plaintext) {
  const key = requireEncryptionKey();
  const iv = crypto.randomBytes(12);
  const json = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);
  return payload.toString('base64');
}

function decryptData(b64) {
  try {
    const key = requireEncryptionKey();
    const payload = Buffer.from(b64, 'base64');
    const iv = payload.slice(0, 12);
    const tag = payload.slice(12, 28);
    const encrypted = payload.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (err) {
    console.error('[whatsappCrypto] decrypt failed:', err.message);
    return null;
  }
}

function getSessionPath(userId) {
  return path.join(SESSION_DIR, `${userId}.enc`);
}

function saveEncryptedSession(userId, sessionData) {
  ensureDir();
  const b64 = encryptData(sessionData);
  fs.writeFileSync(getSessionPath(userId), b64, 'utf8');
}

function loadEncryptedSession(userId) {
  try {
    const p = getSessionPath(userId);
    if (!fs.existsSync(p)) return null;
    const b64 = fs.readFileSync(p, 'utf8');
    return decryptData(b64);
  } catch (err) {
    console.error('[whatsappCrypto] load session failed:', err.message);
    return null;
  }
}

function deleteEncryptedSession(userId) {
  try {
    const p = getSessionPath(userId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    console.error('[whatsappCrypto] delete session failed:', err.message);
  }
}

module.exports = {
  initializeEncryptionKey,
  getEncryptionStatus,
  encryptData,
  decryptData,
  saveEncryptedSession,
  loadEncryptedSession,
  deleteEncryptedSession,
  getSessionPath,
};
