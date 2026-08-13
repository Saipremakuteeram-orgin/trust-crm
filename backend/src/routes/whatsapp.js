const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');
const { manager } = require('@/services/whatsapp/sessionManager');
const { generateTransactionReport } = require('@/lib/whatsappReportGenerator');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

router.get('/status', (req, res) => {
  const status = manager.getStatus(req.user.id);
  res.json({ success: true, result: status });
});

router.get('/qr', async (req, res) => {
  const qr = manager.getQR(req.user.id);
  if (qr) {
    try {
      const QRCode = require('qrcode');
      const dataUrl = await QRCode.toDataURL(qr);
      return res.json({ success: true, result: { qr, dataUrl } });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'QR generation failed' });
    }
  } else {
    res.json({ success: true, result: { qr: null, dataUrl: null } });
  }
});

router.post('/connect', async (req, res) => {
  try {
    const result = await manager.createClient(req.user.id);
    res.json({ success: true, result: result });
  } catch (err) {
    console.error('[whatsapp] connect error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: 'Failed to initialize WhatsApp client' });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    const result = await manager.disconnect(req.user.id);
    res.json({ success: true, result: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to disconnect' });
  }
});

router.get('/chats', async (req, res) => {
  try {
    const chats = await manager.getChats(req.user.id);
    res.json({ success: true, result: chats });
  } catch (err) {
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to fetch chats') });
  }
});

router.get('/sync-contacts', async (req, res) => {
  try {
    const contacts = await manager.syncContacts(req.user.id);
    res.json({ success: true, result: contacts });
  } catch (err) {
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to sync contacts') });
  }
});

router.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const messages = await manager.getChatMessages(req.user.id, req.params.chatId);
    res.json({ success: true, result: messages });
  } catch (err) {
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to fetch messages') });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message are required' });
    }
    const result = await manager.sendText(req.user.id, phone, message);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to send message') });
  }
});

router.post('/send-file', upload.single('file'), async (req, res) => {
  try {
    const { phone, reportType } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone is required' });
    }

    let buffer, mimeType, fileName;

    if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype;
      fileName = req.file.originalname;
    } else if (reportType) {
      const profile = req.profile || { role: 'accountant', full_name: req.user.email };
      const result = await generateTransactionReport(profile, reportType);
      buffer = result.buffer;
      mimeType = result.mimetype;
      fileName = result.fileName;
    } else {
      return res.status(400).json({ success: false, message: 'Either a file or reportType is required' });
    }

    const sendResult = await manager.enqueueFileSend(req.user.id, phone, buffer, mimeType, fileName);
    res.json({ success: true, result: sendResult });
  } catch (err) {
    console.error('[whatsapp] send-file error:', safeErrorMessage(err));
    res.status(500).json({ success: false, message: safeErrorMessage(err, 'Failed to send file') });
  }
});

router.get('/reports', async (req, res) => {
  try {
    res.json({
      success: true,
      result: [
        { type: 'transactions-excel', label: 'Transactions Excel', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { type: 'transactions-pdf', label: 'Transactions PDF', mime: 'application/pdf' },
      ],
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

router.get('/events/stream', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  manager.registerSSE(req.user.id, res);

  req.on('close', () => {
    manager.unregisterSSE(req.user.id);
  });

  res.write(`data: ${JSON.stringify({ event: 'connected' })}\n\n`);
});

// Generates a QR code for any URL WITHOUT requiring a headless browser.
// Used to give users a reliable way to open WhatsApp Web (or a click-to-chat
// link) on their phone. Works in every environment, including production.
router.get('/link-qr', async (req, res) => {
  try {
    const url = (req.query.url && String(req.query.url)) || 'https://web.whatsapp.com';
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });
    res.json({ success: true, result: { dataUrl, url } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'QR generation failed' });
  }
});

module.exports = router;
