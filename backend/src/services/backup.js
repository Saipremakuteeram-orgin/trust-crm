const supabaseAdmin = require('@/config/supabaseAdmin');
const ExcelJS = require('exceljs');
const axios = require('axios');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;

const TABLES = [
  { name: 'transactions', label: 'Transactions' },
  { name: 'contacts', label: 'Contacts' },
  { name: 'categories', label: 'Categories' },
  { name: 'contact_groups', label: 'Groups' },
  { name: 'activity_logs', label: 'Activity Logs' },
];

async function createLog(log) {
  const { data, error } = await supabaseAdmin.from('backup_logs').insert(log).select().single();
  if (error) console.error('Failed to write backup log:', error.message);
  return data;
}

async function updateLog(id, updates) {
  if (!id) return;
  const { error } = await supabaseAdmin.from('backup_logs').update(updates).eq('id', id);
  if (error) console.error('Failed to update backup log:', error.message);
}

async function fetchAllTables() {
  const results = {};
  for (const t of TABLES) {
    const { data, error } = await supabaseAdmin.from(t.name).select('*').limit(5000);
    if (error) {
      console.error(`Backup: failed to fetch ${t.name}:`, error.message);
      results[t.name] = [];
    } else {
      results[t.name] = data || [];
    }
  }
  return results;
}

function buildBackupWorkbook(tables) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Trust CRM Backup';
  workbook.created = new Date();

  for (const t of TABLES) {
    const rows = tables[t.name] || [];
    if (rows.length === 0) {
      workbook.addWorksheet(t.label);
      continue;
    }

    const sheet = workbook.addWorksheet(t.label);
    const headers = Object.keys(rows[0]);
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: 18 }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    rows.forEach((row) => {
      const cleanRow = {};
      for (const [k, v] of Object.entries(row)) {
        cleanRow[k] = typeof v === 'object' ? JSON.stringify(v) : v;
      }
      sheet.addRow(cleanRow);
    });

    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + Math.min(headers.length, 26))}1` };
  }

  return workbook;
}

async function sendBufferToTelegram(buffer, fileName, caption) {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) return null;
  try {
    const form = new FormData();
    form.append('chat_id', STORAGE_CHAT_ID);
    form.append('document', buffer, { filename: fileName });
    if (caption) form.append('caption', caption);

    const resp = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders(), timeout: 60000 }
    );
    return resp.data?.result;
  } catch (err) {
    console.error('Backup: Telegram send failed:', err.message);
    return null;
  }
}

async function sendMessageToTelegram(text) {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) return null;
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: STORAGE_CHAT_ID,
      text,
      parse_mode: 'HTML',
    });
    return true;
  } catch (err) {
    console.error('Backup: Telegram message failed:', err.message);
    return null;
  }
}

async function runDailyBackup(triggerType = 'scheduled') {
  const startTime = Date.now();
  console.log(`📦 Starting backup (trigger: ${triggerType})...`);

  const log = await createLog({
    backup_date: new Date().toISOString().slice(0, 10),
    trigger_type: triggerType,
    status: 'running',
  });

  try {
    const tables = await fetchAllTables();
    const tableCount = Object.values(tables).filter((rows) => rows.length > 0).length;
    const totalRows = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);

    const snapshot = {};
    for (const t of TABLES) {
      snapshot[t.name] = (tables[t.name] || []).length;
    }

    const workbook = buildBackupWorkbook(tables);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = `Trust-CRM-Backup-${dateStr}.xlsx`;

    const sent = await sendBufferToTelegram(buffer, fileName,
      `📦 Backup — ${dateStr}\nTables: ${TABLES.map((t) => t.label).join(', ')}\nTotal Rows: ${totalRows}`);

    if (sent) {
      await sendMessageToTelegram(
        `✅ <b>Backup Complete</b>\n` +
        `📅 ${dateStr}\n` +
        `📊 ${totalRows} rows across ${TABLES.length} tables\n` +
        `⏱️ Took ${((Date.now() - startTime) / 1000).toFixed(1)}s`
      );
    }

    const durationMs = Date.now() - startTime;

    await updateLog(log?.id, {
      status: 'success',
      tables_backed_up: tableCount,
      total_rows: totalRows,
      file_size: buffer.length,
      file_name: fileName,
      telegram_sent: !!sent,
      duration_ms: durationMs,
      snapshot,
    });

    console.log(`✅ Backup done: ${fileName} (${totalRows} rows, ${buffer.length} bytes, ${durationMs}ms)`);
    return { fileName, totalRows, size: buffer.length, sent: !!sent, logId: log?.id };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('❌ Backup failed:', err.message);

    await updateLog(log?.id, {
      status: 'failed',
      error_message: err.message,
      duration_ms: durationMs,
    });

    return { error: err.message, logId: log?.id };
  }
}

async function getBackupStatusToday() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from('backup_logs')
    .select('*')
    .eq('backup_date', today)
    .order('created_at', { ascending: false });

  if (error) return null;
  return data;
}

async function getBackupLogs(limit = 30, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from('backup_logs')
    .select('*')
    .order('backup_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = { runDailyBackup, getBackupStatusToday, getBackupLogs, TABLES };
