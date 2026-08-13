const { Client, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { logActivity } = require('@/lib/logger');
const { safeErrorMessage } = require('@/lib/security');
const { saveEncryptedSession, loadEncryptedSession, deleteEncryptedSession, getSessionPath } = require('@/lib/whatsappCrypto');
const supabaseAdmin = require('@/config/supabaseAdmin');

const PUPPETEER_EXECUTABLE = process.env.PUPPETEER_EXECUTABLE_PATH;

const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-infobars',
  '--window-size=1280,800',
  '--disable-web-security',
  '--disable-features=site-per-process',
  '--disable-site-per-process',
  '--disable-setuptee',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-default-check',
];

class WhatsAppSessionManager {
  constructor() {
    this.clients = new Map();       // Map<userId, Client>
    this.qrData = new Map();       // Map<userId, qrString>
    this.sseClients = new Map();   // Map<userId, res>
    this.fileQueue = [];           // Async file-send queue
    this.processing = false;
  }

  _getStealthPuppeteer() {
    try {
      const puppeteer = require('puppeteer');
      return puppeteer;
    } catch (err) {
      console.warn('[WhatsAppSessionManager] puppeteer not available');
      return require('puppeteer-core');
    }
  }

  _buildClientOptions(userId) {
    const puppeteer = this._getStealthPuppeteer();
    const options = {
      puppeteer: {
        executablePath: PUPPETEER_EXECUTABLE || (puppeteer.executablePath ? puppeteer.executablePath() : undefined),
        headless: 'new',
        args: puppeteerArgs,
        defaultViewport: { width: 1280, height: 800 },
      },
      clientId: `wa_${userId}`,
      sessionId: userId,
    };
    return options;
  }

  _emitSSE(userId, data) {
    const res = this.sseClients.get(userId);
    if (res && !res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  _registerEvents(userId, client) {
    client.on('qr', (qr) => {
      this.qrData.set(userId, qr);
      this._emitSSE(userId, { event: 'qr', data: qr });
    });

    client.on('authenticated', (session) => {
      saveEncryptedSession(userId, session);
      this.qrData.delete(userId);
      this._emitSSE(userId, { event: 'authenticated' });
      logActivity({
        userId,
        userEmail: null,
        action: 'whatsapp_connect',
        entity: 'whatsapp_session',
        details: { status: 'authenticated' },
        ipAddress: null,
      });
    });

    client.on('ready', () => {
      this._emitSSE(userId, { event: 'ready', data: { phone: this._getPhone(client) } });
      logActivity({
        userId,
        userEmail: null,
        action: 'whatsapp_ready',
        entity: 'whatsapp_session',
        details: { phone: this._getPhone(client) },
        ipAddress: null,
      });
    });

    client.on('message_create', (message) => {
      const msgData = this._serializeMessage(message);
      this._emitSSE(userId, { event: 'message', data: msgData });
    });

    client.on('message_ack', (message, contact) => {
      this._emitSSE(userId, { event: 'message_ack', data: { id: message.id.id, ack: message.ack } });
    });

    client.on('disconnected', (reason) => {
      this._emitSSE(userId, { event: 'disconnected', data: { reason: String(reason) } });
      this._safeRemoveClient(userId);
      logActivity({
        userId,
        userEmail: null,
        action: 'whatsapp_disconnect',
        entity: 'whatsapp_session',
        details: { reason: String(reason) },
        ipAddress: null,
      });
    });

    client.on('auth_failure', (msg) => {
      this._emitSSE(userId, { event: 'auth_failure', data: { message: String(msg) } });
      this._safeRemoveClient(userId);
    });

    client.on('error', (err) => {
      console.error(`[WhatsAppSessionManager] client error for user ${userId}:`, safeErrorMessage(err));
      this._emitSSE(userId, { event: 'error', data: { message: safeErrorMessage(err) } });
    });
  }

  _serializeMessage(message) {
    return {
      id: message.id.id,
      from: message.from,
      to: message.to,
      fromMe: message.fromMe,
      body: message.body,
      type: message.type,
      timestamp: message.timestamp,
      ack: message.ack,
      hasMedia: message.hasMedia,
      chatId: message.id.remote,
      pushName: message._chat ? (message._chat.name || null) : null,
    };
  }

  _getPhone(client) {
    try {
      return client.info?.wid?.user || null;
    } catch (e) {
      return null;
    }
  }

  _getVerifiedName(client) {
    try {
      return client.info?.wid?.user || null;
    } catch (e) {
      return null;
    }
  }

  async _safeDestroyClient(userId) {
    const client = this.clients.get(userId);
    if (client) {
      try {
        await client.destroy();
      } catch (err) {
        console.error(`[WhatsAppSessionManager] destroy error for ${userId}:`, err.message);
      }
    }
    this.clients.delete(userId);
    this.qrData.delete(userId);
  }

  async createClient(userId) {
    if (this.clients.has(userId)) {
      return { status: 'already_exists' };
    }

    const session = loadEncryptedSession(userId);
    const options = this._buildClientOptions(userId);

    if (session) {
      options.session = session;
    }

    const client = new Client(options);
    this._registerEvents(userId, client);

    client.initialize().catch(err => console.error('[WhatsAppSessionManager] initialize failed:', err.message));

    this.clients.set(userId, client);
    this.qrData.set(userId, null);

    // Start polling for QR every 2 seconds as a fallback
    const pollStart = Date.now();
    const pollInterval = setInterval(async () => {
      const elapsed = Date.now() - pollStart;
      if (elapsed > 60000) {
        clearInterval(pollInterval);
        return;
      }
      // Check if QR was set by event
      if (this.qrData.get(userId)) {
        clearInterval(pollInterval);
      }
      // Try to fetch current QR
      try {
        const currentQR = await client.getQRCode();
        this.qrData.set(userId, currentQR);
        this._emitSSE(userId, { event: 'qr', data: currentQR });
        clearInterval(pollInterval);
      } catch (e) {
        // Still initializing
      }
    }, 2000);

    return { status: 'initializing' };
  }

  async connect(userId) {
    return this.createClient(userId);
  }

  async disconnect(userId) {
    const client = this.clients.get(userId);
    if (client) {
      try {
        await client.logout();
      } catch (err) {
        console.error(`[WhatsAppSessionManager] logout error for ${userId}:`, err.message);
      }
      try {
        await client.destroy();
      } catch (err) {
        console.error(`[WhatsAppSessionManager] destroy error for ${userId}:`, err.message);
      }
    }
    this.clients.delete(userId);
    this.qrData.delete(userId);
    deleteEncryptedSession(userId);
    this._emitSSE(userId, { event: 'disconnected', data: { reason: 'manual' } });
  }

  getClient(userId) {
    return this.clients.get(userId) || null;
  }

  getStatus(userId) {
    const client = this.clients.get(userId);
    if (!client || !client.info) {
      return { connected: false, phone: null, verifiedName: null };
    }
    return {
      connected: true,
      phone: this._getPhone(client),
      verifiedName: this._getVerifiedName(client),
    };
  }

  getQR(userId) {
    return this.qrData.get(userId) || null;
  }



  async restoreSessions() {
    try {
      const sessionDir = path.dirname(getSessionPath('placeholder'));
      if (!fs.existsSync(sessionDir)) return;
      const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.enc'));
      for (const file of files) {
        const userId = file.replace(/\.enc$/, '');
        try {
          await this.createClient(userId);
          console.log(`[WhatsAppSessionManager] Restored session for user ${userId}`);
        } catch (err) {
          console.error(`[WhatsAppSessionManager] Failed to restore session for ${userId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[WhatsAppSessionManager] restoreSessions error:', err.message);
    }
  }

  registerSSE(userId, res) {
    this.sseClients.set(userId, res);
  }

  unregisterSSE(userId) {
    const res = this.sseClients.get(userId);
    if (res) {
      try {
        res.end();
      } catch (err) {
        /* ignore */
      }
    }
    this.sseClients.delete(userId);
  }

  async getChats(userId) {
    const client = this._requireClient(userId);
    const chats = await client.getChats();
    return chats.map((c) => ({
      id: c.id._serialized,
      name: c.name || c.pushname || c.id.user,
      number: c.id.user,
      isGroup: c.isGroup,
      unreadCount: c.unreadCount,
      lastMessage: c.lastMessage ? { body: c.lastMessage.body, timestamp: c.lastMessage.timestamp } : null,
      isWAContact: true,
    }));
  }

  async getChatMessages(userId, chatId, limit = 50) {
    const client = this._requireClient(userId);
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    return messages.map((m) => this._serializeMessage(m));
  }

  async sendText(userId, phone, text) {
    const client = this._requireClient(userId);
    const chatId = this._buildChatId(phone);
    const message = await client.sendMessage(chatId, text);
    return { id: message.id.id, status: 'sent' };
  }

  async sendFile(userId, phone, buffer, mimeType, fileName) {
    const client = this._requireClient(userId);
    const chatId = this._buildChatId(phone);
    const media = MessageMedia.fromData(buffer, mimeType, fileName);
    const message = await client.sendMessage(chatId, media);
    return { id: message.id.id, status: 'sent' };
  }

  _buildChatId(phone) {
    return `${this._formatPhone(phone)}@c.us`;
  }

  _formatPhone(phone) {
    let cleaned = String(phone || '').replace(/\D/g, '');
    if (cleaned.startsWith('00')) cleaned = cleaned.substring(2);
    if (cleaned.startsWith('0')) cleaned = '91' + cleaned.substring(1);
    if (!cleaned.startsWith('91')) cleaned = '91' + cleaned;
    return cleaned;
  }

  _requireClient(userId) {
    const client = this.clients.get(userId);
    if (!client) throw new Error('WhatsApp client not initialized for this user');
    return client;
  }

  async enqueueFileSend(userId, phone, buffer, mimeType, fileName) {
    return new Promise((resolve, reject) => {
      this.fileQueue.push({ userId, phone, buffer, mimeType, fileName, resolve, reject });
      this._processFileQueue();
    });
  }

  async _processFileQueue() {
    if (this.processing || this.fileQueue.length === 0) return;
    this.processing = true;
    while (this.fileQueue.length > 0) {
      const job = this.fileQueue.shift();
      try {
        const result = await this.sendFile(job.userId, job.phone, job.buffer, job.mimeType, job.fileName);
        job.resolve(result);
      } catch (err) {
        console.error('[WhatsAppSessionManager] file send failed:', safeErrorMessage(err));
        job.reject(err);
      }
    }
    this.processing = false;
  }

  async syncContacts(userId) {
    const client = this._requireClient(userId);
    const waContacts = await client.getContacts();

    const { data: crmContacts, error } = await supabaseAdmin
      .from('contacts')
      .select('id, name, email, phone')
      .order('name');

    const normalizePhone = (p) => {
      if (!p) return null;
      let d = String(p).replace(/\D/g, '');
      if (d.startsWith('00')) d = d.substring(2);
      if (d.startsWith('0')) d = '91' + d.substring(1);
      if (!d.startsWith('91')) d = '91' + d;
      return d;
    };

    const waPhoneMap = new Map();
    for (const c of waContacts) {
      const number = normalizePhone(c.number);
      if (number) waPhoneMap.set(number, c);
    }

    return (crmContacts || []).map((crm) => {
      const phoneNorm = normalizePhone(crm.phone);
      const wa = waPhoneMap.get(phoneNorm);
      return {
        ...crm,
        isWhatsApp: !!wa,
        waName: wa ? (wa.name || wa.pushname || null) : null,
      };
    });
  }
}

const manager = new WhatsAppSessionManager();
module.exports = { WhatsAppSessionManager, manager };
