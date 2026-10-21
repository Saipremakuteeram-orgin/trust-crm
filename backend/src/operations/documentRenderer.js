'use strict';

const PDFDocument = require('pdfkit');

function valueFrom(source, ...keys) {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return null;
}

function text(value, fallback = '-') {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function donorFor(donation) {
  return donation?.donor || donation?.person || donation?.people || {};
}

function trustNameFor(trust) {
  return text(valueFrom(trust, 'name', 'legalName', 'legal_name'), 'Trust');
}

function amountFor(donation, invoice) {
  const amount = valueFrom(invoice, 'totalAmount', 'total_amount', 'amount')
    ?? valueFrom(donation, 'amount', 'total_amount');
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : text(amount, '0.00');
}

function currencyFor(donation, invoice) {
  return text(valueFrom(invoice, 'currency') || valueFrom(donation, 'currency'), 'INR').toUpperCase();
}

function dateFor(donation) {
  return text(valueFrom(donation, 'donationDate', 'donation_date', 'paymentDate', 'payment_date'), '-');
}

function numberFor(document, ...keys) {
  return text(valueFrom(document, ...keys), '-');
}

function addTrustHeader(doc, trust, title, documentNumber) {
  const name = trustNameFor(trust);
  doc.fillColor('#143d59').font('Helvetica-Bold').fontSize(20).text(name, { align: 'center' });
  if (trust?.legal_name || trust?.legalName) {
    doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(text(trust.legal_name || trust.legalName), { align: 'center' });
  }
  doc.moveDown(1.3);
  doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(17).text(title, { align: 'center' });
  doc.font('Helvetica').fontSize(10).fillColor('#374151').text(documentNumber, { align: 'center' });
  doc.moveDown(1.2);
  doc.strokeColor('#d1d5db').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1.2);
}

function addTrustRegistrationDetails(doc, trust) {
  const details = [
    ['PAN', valueFrom(trust, 'pan')],
    ['80G', valueFrom(trust, 'section_80g_number', 'section80gNumber', 'section80g', '80g')],
    ['12A', valueFrom(trust, 'section_12a_number', 'section12aNumber', 'section12a', '12a')],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (details.length === 0) return;

  doc.font('Helvetica').fontSize(9).fillColor('#4b5563');
  for (const [label, value] of details) doc.text(`${label}: ${text(value)}`);
  doc.moveDown(1);
}

function addDonationDetails(doc, donation, trust, documentType, documentNumber) {
  const donor = donorFor(donation);
  const donorName = text(valueFrom(donor, 'fullName', 'full_name', 'name')
    || valueFrom(donation, 'donorName', 'donor_name'), 'Donor');
  const donorEmail = valueFrom(donor, 'email') || valueFrom(donation, 'donorEmail', 'donor_email');
  const donorPhone = valueFrom(donor, 'phone') || valueFrom(donation, 'donorPhone', 'donor_phone');
  const currency = currencyFor(donation);
  const amount = amountFor(donation);
  const purpose = text(valueFrom(donation, 'purpose', 'description'), 'Donation');

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Donation details');
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937');
  doc.text(`Document type: ${documentType}`);
  doc.text(`Document number: ${documentNumber}`);
  doc.text(`Donor name: ${donorName}`);
  if (donorEmail) doc.text(`Donor email: ${text(donorEmail)}`);
  if (donorPhone) doc.text(`Donor phone: ${text(donorPhone)}`);
  doc.text(`Donation amount: ${currency} ${amount}`);
  doc.text(`Payment date: ${dateFor(donation)}`);
  doc.text(`Purpose: ${purpose}`);
}

function renderPdf({ trust, donation, document, title, documentType, documentNumber }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50, compress: false, info: { Title: title, Author: trustNameFor(trust) } });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    addTrustHeader(pdf, trust, title, documentNumber);
    addTrustRegistrationDetails(pdf, trust);
    addDonationDetails(pdf, donation, trust, documentType, documentNumber);

    if (documentType === 'invoice') {
      pdf.moveDown(1.2);
      pdf.font('Helvetica-Bold').fontSize(11).text('Invoice summary');
      pdf.font('Helvetica').fontSize(10);
      const subtotal = valueFrom(document, 'subtotal', 'subtotal_amount') ?? valueFrom(donation, 'amount');
      const tax = valueFrom(document, 'taxAmount', 'tax_amount') ?? 0;
      pdf.text(`Subtotal: ${currencyFor(donation, document)} ${Number(subtotal || 0).toFixed(2)}`);
      pdf.text(`Tax: ${currencyFor(donation, document)} ${Number(tax || 0).toFixed(2)}`);
      pdf.text(`Total: ${currencyFor(donation, document)} ${amountFor(donation, document)}`);
      if (valueFrom(document, 'dueDate', 'due_date')) pdf.text(`Due date: ${text(valueFrom(document, 'dueDate', 'due_date'))}`);
    } else {
      pdf.moveDown(1.2);
      pdf.font('Helvetica-Bold').fontSize(11).text('Receipt acknowledgement');
      pdf.font('Helvetica').fontSize(10).text('Thank you for your donation. This receipt is issued for your records.');
    }

    pdf.moveDown(2);
    pdf.font('Helvetica-Oblique').fontSize(9).fillColor('#6b7280')
      .text('This document was generated electronically and is an immutable record of the donation document.');
    pdf.end();
  });
}

async function renderDonationReceipt({ trust, donation, receipt } = {}) {
  const receiptNumber = numberFor(receipt, 'receiptNumber', 'receipt_number');
  return renderPdf({
    trust,
    donation,
    document: receipt,
    title: 'Donation Receipt',
    documentType: 'receipt',
    documentNumber: `Receipt number: ${receiptNumber}`,
  });
}

async function renderDonationInvoice({ trust, donation, invoice } = {}) {
  const invoiceNumber = numberFor(invoice, 'invoiceNumber', 'invoice_number');
  return renderPdf({
    trust,
    donation,
    document: invoice,
    title: 'Donation Invoice',
    documentType: 'invoice',
    documentNumber: `Invoice number: ${invoiceNumber}`,
  });
}

module.exports = {
  renderDonationReceipt,
  renderDonationInvoice,
};
