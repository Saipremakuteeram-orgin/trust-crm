const path = require('path');

function sanitizePath(filePath) {
  return path.posix.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
}

function isSafePath(filePath) {
  const normalized = path.posix.normalize(filePath);
  return !normalized.startsWith('..') && !normalized.startsWith('/') && !normalized.includes('\\');
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 200);
}

function safeContentDisposition(fileName) {
  const safe = sanitizeFileName(fileName).replace(/["';\r\n]/g, '');
  return `attachment; filename="${safe}"`;
}

function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '<div></div>')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '');
}

function safeErrorMessage(err, fallback) {
  if (process.env.NODE_ENV === 'development') {
    return err?.message || fallback || 'Internal server error';
  }
  return fallback || 'Internal server error';
}

module.exports = {
  sanitizePath,
  isSafePath,
  sanitizeFileName,
  safeContentDisposition,
  sanitizeHtml,
  safeErrorMessage,
};
