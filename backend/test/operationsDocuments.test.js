'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createDocumentNumberService } = require('../src/operations/documentNumberService');
const { renderDonationInvoice, renderDonationReceipt } = require('../src/operations/documentRenderer');

function extractPdfText(buffer) {
  const streams = buffer.toString('latin1').match(/stream\r?\n([\s\S]*?)\r?\nendstream/g) || [];
  return streams.map((stream) => Array.from(stream.matchAll(/<([0-9a-f]+)>/gi))
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('')).join('\n');
}

test('operations document numbers are unique per trust/document/year and do not share counters', async () => {
  const counters = new Map();
  const calls = [];
  const numberService = createDocumentNumberService({
    numberRepository: {
      async nextNumber(input) {
        calls.push(input);
        // The injected repository represents the database-backed atomic RPC.
        await new Promise((resolve) => setImmediate(resolve));
        const key = `${input.trustId}:${input.documentType}:${input.financialYear}`;
        const value = (counters.get(key) || 0) + 1;
        counters.set(key, value);
        const prefix = input.documentType === 'receipt' ? 'RCT' : 'INV';
        return `${prefix}-${input.financialYear}-${String(value).padStart(6, '0')}`;
      },
    },
  });

  const receipts = await Promise.all(Array.from({ length: 20 }, () => numberService.nextDocumentNumber({
    trustId: 'trust-a', documentType: 'receipt', financialYear: '2026-27',
  })));
  const invoices = await Promise.all(Array.from({ length: 20 }, () => numberService.nextDocumentNumber({
    trustId: 'trust-a', documentType: 'invoice', financialYear: '2026-27',
  })));

  assert.equal(new Set(receipts).size, 20);
  assert.equal(new Set(invoices).size, 20);
  assert.equal(receipts[0], 'RCT-2026-27-000001');
  assert.equal(invoices[0], 'INV-2026-27-000001');
  assert.equal(calls.length, 40);
  assert.equal(counters.get('trust-a:receipt:2026-27'), 20);
  assert.equal(counters.get('trust-a:invoice:2026-27'), 20);
});

const documentFixture = {
  trust: {
    id: 'trust-a',
    name: 'Sundar Community Trust',
    legal_name: 'Sundar Community Trust Public Charitable Trust',
    pan: 'ABCDE1234F',
    section_80g_number: '80G-123',
    section_12a_number: '12A-456',
  },
  donation: {
    id: 'donation-a',
    amount: 1250,
    currency: 'INR',
    donation_date: '2026-10-20',
    purpose: 'Community kitchen',
    donor: { full_name: 'Asha Donor', email: 'asha@example.com' },
  },
};

test('operations receipt and invoice render non-empty PDF buffers with key text', async () => {
  const receipt = await renderDonationReceipt({
    ...documentFixture,
    receipt: { receipt_number: 'RCT-2026-27-000001' },
  });
  const invoice = await renderDonationInvoice({
    ...documentFixture,
    invoice: { invoice_number: 'INV-2026-27-000001', total_amount: 1250, subtotal: 1250, tax_amount: 0 },
  });

  assert.ok(Buffer.isBuffer(receipt));
  assert.ok(Buffer.isBuffer(invoice));
  assert.ok(receipt.length > 100);
  assert.ok(invoice.length > 100);
  assert.equal(receipt.subarray(0, 5).toString(), '%PDF-');
  assert.equal(invoice.subarray(0, 5).toString(), '%PDF-');

  const receiptText = extractPdfText(receipt);
  const invoiceText = extractPdfText(invoice);
  for (const value of ['Sundar Community Trust', 'Asha Donor', '1250.00', '2026-10-20', 'RCT-2026-27-000001', 'PAN', '80G', '12A']) {
    assert.match(receiptText, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const value of ['Sundar Community Trust', 'Asha Donor', '1250.00', '2026-10-20', 'INV-2026-27-000001', 'PAN', '80G', '12A']) {
    assert.match(invoiceText, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
