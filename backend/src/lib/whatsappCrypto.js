const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '..', '..', '.wa-sessions');
const RAW_KEY = process.env.WA_SESSION_ENCRYPTION_KEY;

if (!RAW_KEY) {
  throw new Error('WA_SESSION_ENCRYPTION_KEY is required — set a 64-char hex key (openssl rand -hex 32) in your environment');
}
if (RAW_KEY.length !== 64) {
  throw new Error('WA_SESSION_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
}
const ENC_KEY = Buffer.from(RAW_KEY, 'hex');

function ensureDir() {
  try {
    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch (err) {
    console.error('[whatsappCrypto] failed to create session dir:', err.message);
  }
}

function encryptData(plaintext) {
  const iv = crypto.randomBytes(12);
  const json = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]);
  return payload.toString('base64');
}

function decryptData(b64) {
  try {
    const payload = Buffer.from(b64, 'base64');
    const iv = payload.slice(0, 12);
    const tag = payload.slice(12, 28);
    const encrypted = payload.slice(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
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
  encryptData,
  decryptData,
  saveEncryptedSession,
  loadEncryptedSession,
  deleteEncryptedSession,
  getSessionPath,
};
