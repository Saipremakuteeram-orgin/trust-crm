const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const storage = require('@/services/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

// GET /api/drive — list files in a folder
router.get('/', async (req, res) => {
  try {
    const folder = req.query.folder || '';
    const items = await storage.listFiles(folder);

    const folders = items.filter((i) => i.id === null).map((f) => ({
      id: `${folder ? folder + '/' : ''}${f.name}`,
      name: f.name,
      mimeType: 'application/vnd.google-apps.folder',
      createdTime: f.created_at,
    }));

    const files = items.filter((i) => i.id !== null).map((f) => ({
      id: `${folder ? folder + '/' : ''}${f.name}`,
      name: f.name,
      size: f.metadata?.size || 0,
      mimeType: f.metadata?.mimetype || 'application/octet-stream',
      createdTime: f.created_at,
      modifiedTime: f.updated_at,
    }));

    res.json({ success: true, result: { files: [...folders, ...files], currentFolder: folder || null } });
  } catch (err) {
    console.error('Drive list error:', err.message);
    res.json({ success: true, result: { files: [], currentFolder: null } });
  }
});

// POST /api/drive/folder — create folder (by uploading a .folderkeep marker)
router.post('/folder', async (req, res) => {
  try {
    const { parent, name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }
    const folderPath = `${parent ? parent + '/' : ''}${name.trim()}`;
    const markerPath = `${folderPath}/.folderkeep`;
    await storage.uploadFile(markerPath, Buffer.from(''), 'application/octet-stream');

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'drive_folder',
      entityId: folderPath,
      details: { name: name.trim(), parent: parent || null },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { id: folderPath, name: name.trim() } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/upload — upload file(s)
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }
    const folder = req.body.folder || '';
    const results = [];

    for (const file of req.files) {
      const filePath = folder ? `${folder}/${file.originalname}` : file.originalname;
      await storage.uploadFile(filePath, file.buffer, file.mimetype);

      logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'upload',
        entity: 'drive_file',
        entityId: filePath,
        details: { name: file.originalname, size: file.size },
        ipAddress: req.ip,
      });

      results.push({ id: filePath, name: file.originalname, size: file.size });
    }

    res.json({ success: true, result: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/drive — delete file(s)
router.delete('/', async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }
    for (const f of files) {
      await storage.deleteFile(f);
      logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'delete',
        entity: 'drive_file',
        entityId: f,
        details: { path: f },
        ipAddress: req.ip,
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/move — move file(s) to a folder
router.post('/move', async (req, res) => {
  try {
    const { files, targetFolder } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }
    for (const f of files) {
      const fileName = f.split('/').pop();
      const toPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
      await storage.moveFile(f, toPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/drive/rename — rename file (move to new path)
router.patch('/rename', async (req, res) => {
  try {
    const { path, newName } = req.body;
    if (!path || !newName) {
      return res.status(400).json({ success: false, message: 'path and newName required' });
    }
    const parts = path.split('/');
    parts.pop();
    const newPath = [...parts, newName].filter(Boolean).join('/');
    await storage.moveFile(path, newPath);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'rename',
      entity: 'drive_file',
      entityId: path,
      details: { old: path, new: newPath },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { id: newPath, name: newName } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/drive/download — download file
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ success: false, message: 'path required' });
    const signedUrl = await storage.getSignedUrl(filePath, 300);
    res.json({ success: true, result: { url: signedUrl } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
