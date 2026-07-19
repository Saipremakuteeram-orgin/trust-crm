const supabaseAdmin = require('@/config/supabaseAdmin');
const axios = require('axios');

const BUCKET_NAME = 'trust-crm-files';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;

async function ensureBucket() {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024,
    });
    console.log('Storage bucket created:', BUCKET_NAME);
  }
}

async function uploadFile(path, fileBuffer, contentType) {
  await ensureBucket();
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(path, fileBuffer, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return data;
}

async function downloadFile(path) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(path);
  if (error) throw new Error(error.message);
  return data;
}

async function listFiles(folder = '') {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list(folder, { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  return (data || []).filter((f) => f.name !== '.folderkeep');
}

async function deleteFile(path) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .remove([path]);
  if (error) throw new Error(error.message);
}

async function moveFile(fromPath, toPath) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .move(fromPath, toPath);
  if (error) throw new Error(error.message);
}

async function getSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

async function sendFileToTelegram(filePath, fileName, caption) {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) return null;
  try {
    const fileData = await downloadFile(filePath);
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const FormData = require('form-data');
    const form = new FormData();
    form.append('chat_id', STORAGE_CHAT_ID);
    form.append('document', buffer, { filename: fileName });
    if (caption) form.append('caption', caption);

    const resp = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders(), timeout: 30000 }
    );
    return resp.data?.result;
  } catch (err) {
    console.error('Telegram send file failed:', err.message);
    return null;
  }
}

async function getTelegramFileStream(fileId) {
  if (!BOT_TOKEN || !fileId) return null;
  try {
    const meta = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile`, {
      params: { file_id: fileId },
    });
    const filePath = meta.data?.result?.file_path;
    if (!filePath) return null;
    const resp = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`, {
      responseType: 'stream',
      timeout: 60000,
    });
    return { stream: resp.data, filePath };
  } catch (err) {
    console.error('Telegram get file stream failed:', err.message);
    return null;
  }
}

module.exports = {
  ensureBucket,
  uploadFile,
  downloadFile,
  listFiles,
  deleteFile,
  moveFile,
  getSignedUrl,
  sendFileToTelegram,
  getTelegramFileStream,
  BUCKET_NAME,
};
