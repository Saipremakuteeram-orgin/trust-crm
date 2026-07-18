const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const {
  getCommonFolderId,
  listFiles,
  getFileInfo,
  createFolder,
  uploadFile,
  renameFile,
  moveFile,
  copyFile,
  trashFile,
} = require('@/services/googleDrive');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

// GET /api/drive — list files in Common folder (or subfolder)
router.get('/', async (req, res) => {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.json({ success: true, result: { files: [], currentFolder: null, folderId: null, message: 'Google Drive not configured' } });
    }
    const folderId = req.query.folderId || await getCommonFolderId();
    const files = await listFiles(folderId);
    let currentFolder = null;
    if (req.query.folderId) {
      currentFolder = await getFileInfo(req.query.folderId);
    }
    res.json({ success: true, result: { files, currentFolder, folderId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/drive/info/:fileId — get file/folder details
router.get('/info/:fileId', async (req, res) => {
  try {
    const info = await getFileInfo(req.params.fileId);
    res.json({ success: true, result: info });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/folder — create a new folder
router.post('/folder', async (req, res) => {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(500).json({ success: false, message: 'Google Drive is not configured on the server.' });
    }
    const { parentId, name } = req.body;
    const parent = parentId || await getCommonFolderId();
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }
    const folder = await createFolder(parent, name.trim());

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'drive_folder',
      entityId: folder.id,
      details: { name: folder.name, parent_id: parent },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: folder });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/upload — upload a file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(500).json({ success: false, message: 'Google Drive is not configured on the server.' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const parentId = req.body.parentId || await getCommonFolderId();
    const file = await uploadFile(parentId, req.file.originalname, req.file.mimetype, req.file.buffer);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'upload',
      entity: 'drive_file',
      entityId: file.id,
      details: { name: file.name, size: file.size, parent_id: parentId },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: file });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/drive/rename — rename a file or folder
router.patch('/rename', async (req, res) => {
  try {
    const { fileId, name } = req.body;
    if (!fileId || !name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'fileId and name are required' });
    }
    const result = await renameFile(fileId, name.trim());

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'rename',
      entity: 'drive_file',
      entityId: fileId,
      details: { new_name: name.trim() },
      ipAddress: req.ip,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/drive/move — move a file or folder
router.patch('/move', async (req, res) => {
  try {
    const { fileId, targetFolderId } = req.body;
    if (!fileId || !targetFolderId) {
      return res.status(400).json({ success: false, message: 'fileId and targetFolderId are required' });
    }
    const result = await moveFile(fileId, targetFolderId);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'move',
      entity: 'drive_file',
      entityId: fileId,
      details: { target_folder_id: targetFolderId },
      ipAddress: req.ip,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/copy — copy a file
router.post('/copy', async (req, res) => {
  try {
    const { fileId, targetFolderId, name } = req.body;
    if (!fileId || !targetFolderId) {
      return res.status(400).json({ success: false, message: 'fileId and targetFolderId are required' });
    }
    const result = await copyFile(fileId, targetFolderId, name);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'copy',
      entity: 'drive_file',
      entityId: fileId,
      details: { target_folder_id: targetFolderId, new_name: name },
      ipAddress: req.ip,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/drive/trash — move to trash (not permanent delete)
router.post('/trash', async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ success: false, message: 'fileId is required' });

    const info = await getFileInfo(fileId);
    const result = await trashFile(fileId);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'trash',
      entity: 'drive_file',
      entityId: fileId,
      details: { name: info.name },
      ipAddress: req.ip,
    });

    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
