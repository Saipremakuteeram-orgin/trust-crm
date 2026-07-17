require('module-alias/register');
require('dotenv').config();
const supabaseAdmin = require('./src/config/supabaseAdmin');
const { notifyContactsOfTransaction } = require('./src/services/notify');
const { generateAndSendMonthlyReport } = require('./src/cron/monthlyReport');

async function runTests() {
  console.log('--- Phase 6: Testing Notifications ---');
  
  // 1. Add a test contact
  console.log('Adding test contact...');
  const { data: contact, error: cErr } = await supabaseAdmin.from('contacts').insert({
    name: 'Test Contact',
    email: process.env.SMTP_USER, // sending to themselves
    telegram_chat_id: '123456789', // fake or real if we had it
    subscribe_monthly_report: true,
  }).select().single();

  if (cErr) console.error('Error adding contact:', cErr.message);

  // 2. Add a test transaction
  console.log('Simulating a transaction notification...');
  const txn = {
    amount: 500,
    type: 'credit',
    mode: 'digital',
    digital_method: 'upi',
    party: 'Test Donor',
    txn_date: new Date().toISOString(),
    description: 'Test transaction from Antigravity',
  };

  if (contact) {
    const results = await notifyContactsOfTransaction(txn, [contact]);
    console.log('Notification Results:', JSON.stringify(results, null, 2));
  }

  // 3. Test Monthly Report
  console.log('Triggering Monthly Report...');
  await generateAndSendMonthlyReport();
  
  // Clean up test contact
  if (contact) {
    await supabaseAdmin.from('contacts').delete().eq('id', contact.id);
    console.log('Cleaned up test contact.');
  }

  console.log('--- Testing Complete ---');
}

runTests();
