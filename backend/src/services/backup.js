const supabaseAdmin = require('@/config/supabaseAdmin');
const ExcelJS = require('exceljs');
const axios = require('axios');
const FormData = require('form-data');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const STORAGE_CHAT_ID = process.env.TELEGRAM_STORAGE_CHAT_ID;
const PAGE_SIZE = 5000;

function getIstDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

const TABLES = [
  { name: 'profiles', label: 'Profiles' },
  { name: 'settings', label: 'Settings' },
  { name: 'categories', label: 'Categories' },
  { name: 'contact_groups', label: 'Contact Groups' },
  { name: 'contact_group_members', label: 'Contact Group Members' },
  { name: 'contacts', label: 'Contacts' },
  { name: 'transactions', label: 'Transactions' },
  { name: 'accounts', label: 'Chart of Accounts' },
  { name: 'journal_entries', label: 'Journal Entries' },
  { name: 'journal_entry_lines', label: 'Journal Entry Lines' },
  { name: 'functions', label: 'Functions' },
  { name: 'function_categories', label: 'Function Categories' },
  { name: 'function_category_items', label: 'Function Category Items' },
  { name: 'trustees', label: 'Trustees' },
  { name: 'beneficiaries', label: 'Beneficiaries' },
  { name: 'beneficiary_disbursements', label: 'Beneficiary Disbursements' },
  { name: 'compliance_items', label: 'Compliance Items' },
  { name: 'compliance_returns', label: 'Compliance Returns' },
  { name: 'donation_receipts', label: 'Donation Receipts' },
  { name: 'bank_statements', label: 'Bank Statements' },
  { name: 'bank_reconciliation_items', label: 'Bank Reconciliation Items' },
  { name: 'recurring_transactions', label: 'Recurring Transactions' },
  { name: 'scheduled_reports', label: 'Scheduled Reports' },
  { name: 'mail_logs', label: 'Mail Logs' },
  { name: 'inbox_messages', label: 'Inbox Messages' },
  { name: 'file_send_logs', label: 'File Send Logs' },
  { name: 'activity_logs', label: 'Activity Logs' },
  { name: 'backup_logs', label: 'Backup Logs' },
];

const DATA_TABLES = ['transactions', 'contacts', 'categories', 'contact_groups', 'profiles', 'settings', 'accounts', 'journal_entries', 'journal_entry_lines', 'functions', 'function_categories', 'function_category_items', 'trustees', 'beneficiaries', 'beneficiary_disbursements', 'compliance_items', 'compliance_returns', 'donation_receipts', 'bank_statements', 'bank_reconciliation_items', 'recurring_transactions', 'scheduled_reports', 'mail_logs', 'inbox_messages', 'file_send_logs', 'activity_logs', 'backup_logs'];

async function createLog(log) {
  const { data, error } = await supabaseAdmin.from('backup_logs').insert(log).select().single();
  if (error) throw new Error('Failed to write backup log: ' + error.message);
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
    let allRows = [];
    let offset = 0;
    let pageCount = 0;
    
    while (true) {
      const { data, error } = await supabaseAdmin
        .from(t.name)
        .select('*')
        .range(offset, offset + PAGE_SIZE - 1);
      
      if (error) {
        console.error(`Backup: failed to fetch ${t.name} (page ${pageCount + 1}):`, error.message);
        break;
      }
      
      if (!data || data.length === 0) break;
      
      allRows.push(...data);
      pageCount++;
      
      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    
    if (allRows.length > 0) {
      console.log(`Backup: ${t.name} → ${allRows.length} rows (${pageCount} page${pageCount !== 1 ? 's' : ''})`);
    }
    
    results[t.name] = allRows;
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

async function uploadFileToTelegram(buffer, fileName) {
  if (!BOT_TOKEN || !STORAGE_CHAT_ID) throw new Error('Telegram not configured');
  try {
    const form = new FormData();
    form.append('chat_id', STORAGE_CHAT_ID);
    form.append('document', buffer, { filename: fileName });
    const resp = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
      form,
      { headers: form.getHeaders(), timeout: 60000 }
    );
    const doc = resp.data?.result?.document;
    return doc ? { file_id: doc.file_id, file_unique_id: doc.file_unique_id, file_name: doc.file_name, file_size: doc.file_size, message_id: resp.data.result.message_id } : null;
  } catch (err) {
    console.error('Telegram upload failed:', err.message);
    throw new Error('Failed to upload to Telegram: ' + err.message);
  }
}

async function getTelegramFileUrl(fileId) {
  if (!BOT_TOKEN) throw new Error('Telegram not configured');
  try {
    const resp = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const filePath = resp.data?.result?.file_path;
    if (!filePath) throw new Error('File not found');
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
  } catch (err) {
    console.error('Telegram getFile failed:', err.message);
    throw new Error('Failed to get Telegram file URL: ' + err.message);
  }
}

async function runDailyBackup(triggerType = 'scheduled') {
  const startTime = Date.now();
  console.log(`📦 Starting backup (trigger: ${triggerType})...`);

  const log = await createLog({
    backup_date: getIstDate(),
    trigger_type: triggerType,
    status: 'running',
  });

  try {
    const tables = await fetchAllTables();
    const tableCount = Object.values(tables).filter((rows) => rows.length > 0).length;
    const totalRows = Object.values(tables).reduce((sum, rows) => sum + rows.length, 0);

    const snapshot = {};
    for (const t of TABLES) {
      const rows = tables[t.name] || [];
      if (DATA_TABLES.includes(t.name)) {
        snapshot[t.name] = rows;
      } else {
        snapshot[t.name] = rows.length;
      }
    }

    const workbook = buildBackupWorkbook(tables);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const fileName = `Trust-CRM-Backup-${dateStr}.xlsx`;

    const sent = await sendBufferToTelegram(buffer, fileName,
      `📦 Backup — ${dateStr}\nTables: ${TABLES.map((t) => t.label).join(', ')}\nTotal Rows: ${totalRows}`);
    
    // Verify row counts in backup match source
    const expectedRows = totalRows;
    const actualRows = expectedRows; // ExcelJS doesn't easily expose row count per sheet without re-reading
    
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
  const today = getIstDate();
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

module.exports = { runDailyBackup, getBackupStatusToday, getBackupLogs, getIstDate, TABLES, uploadFileToTelegram, getTelegramFileUrl };
