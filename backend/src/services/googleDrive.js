const { google } = require('googleapis');
const stream = require('stream');

let driveClient = null;

function getDrive() {
  if (driveClient) return driveClient;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const privateKey = rawKey
    ?.replace(/\\n/g, '\n')
    ?.replace(/\\r/g, '')
    ?.replace(/\r\n/g, '\n')
    ?.trim();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const userEmail = process.env.GOOGLE_DRIVE_USER_EMAIL;

  if (!clientEmail || !privateKey) {
    console.error('Google Drive: missing env vars', {
      hasEmail: !!clientEmail,
      hasKey: !!privateKey,
      rawKeyLength: rawKey?.length || 0,
    });
    return null;
  }

  console.log('Google Drive: initializing with email:', clientEmail, 'folderId:', folderId || '(none)', 'userEmail:', userEmail || '(none)');

  try {
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    driveClient = { auth, folderId, userEmail };
    return driveClient;
  } catch (err) {
    console.error('Google Drive: auth initialization failed:', err.message);
    return null;
  }
}

function getDriveApi() {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');
  return { driveApi: google.drive({ version: 'v3', auth: drive.auth }), drive };
}

async function shareWithEmail(fileId, email) {
  if (!email) return;
  try {
    const { driveApi } = getDriveApi();
    await driveApi.permissions.create({
      fileId,
      resource: {
        type: 'user',
        role: 'writer',
        emailAddress: email,
      },
      sendNotificationEmail: false,
    });
  } catch (err) {
    console.error('Drive share error:', err.message);
  }
}

async function getOrCreateSubfolder(parentFolderId, folderName) {
  const { driveApi } = getDriveApi();

  const query = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await driveApi.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const response = await driveApi.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, name',
  });

  return response.data.id;
}

async function getOrCreateRootFolder() {
  const { drive, driveApi } = getDriveApi();
  if (drive.folderId) return drive.folderId;

  const rootResponse = await driveApi.about.get({ fields: 'user' });
  const rootId = rootResponse.data.user ? 'root' : null;
  if (!rootId) throw new Error('Cannot access Google Drive root');

  const folderName = 'Trust CRM';
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await driveApi.files.list({ q: query, fields: 'files(id)', pageSize: 1 });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const response = await driveApi.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootId],
    },
    fields: 'id',
  });

  await shareWithEmail(response.data.id, drive.userEmail);
  return response.data.id;
}

async function getCommonFolderId() {
  const { drive } = getDriveApi();

  const commonId = process.env.GOOGLE_DRIVE_COMMON_FOLDER_ID;
  if (commonId) return commonId;

  const rootId = await getOrCreateRootFolder();
  return getOrCreateSubfolder(rootId, 'Common');
}

async function listFiles(folderId, pageSize = 100) {
  const { driveApi } = getDriveApi();
  const q = `'${folderId}' in parents and trashed = false`;
  const response = await driveApi.files.list({
    q,
    pageSize,
    fields: 'files(id, name, webViewLink, createdTime, modifiedTime, mimeType, size, parents)',
    orderBy: 'name',
  });

  const files = response.data.files || [];
  const folders = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
  const regularFiles = files.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
  return [...folders, ...regularFiles];
}

async function getFileInfo(fileId) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.get({
    fileId,
    fields: 'id, name, webViewLink, createdTime, modifiedTime, mimeType, size, parents',
  });
  return response.data;
}

async function createFolder(parentId, name) {
  const { driveApi, drive } = getDriveApi();
  const response = await driveApi.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name, mimeType, createdTime',
  });

  await shareWithEmail(response.data.id, drive.userEmail);
  return response.data;
}

async function uploadFile(parentId, fileName, mimeType, fileBuffer) {
  const { driveApi, drive } = getDriveApi();
  const response = await driveApi.files.create({
    resource: { name: fileName, parents: [parentId] },
    media: { mimeType, body: stream.Readable.from(fileBuffer) },
    fields: 'id, name, mimeType, size, createdTime',
  });

  await shareWithEmail(response.data.id, drive.userEmail);
  return response.data;
}

async function renameFile(fileId, newName) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.update({
    fileId,
    resource: { name: newName },
    fields: 'id, name, modifiedTime',
  });
  return response.data;
}

async function moveFile(fileId, newParentId) {
  const { driveApi } = getDriveApi();
  const file = await driveApi.files.get({ fileId, fields: 'parents' });
  const oldParents = file.data.parents ? file.data.parents.join(',') : '';

  const response = await driveApi.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParents,
    fields: 'id, name, parents',
  });
  return response.data;
}

async function copyFile(fileId, newParentId, newName) {
  const { driveApi, drive } = getDriveApi();
  const resource = { parents: [newParentId] };
  if (newName) resource.name = newName;

  const response = await driveApi.files.copy({
    fileId,
    resource,
    fields: 'id, name, mimeType, size, createdTime',
  });

  await shareWithEmail(response.data.id, drive.userEmail);
  return response.data;
}

async function trashFile(fileId) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.update({
    fileId,
    resource: { trashed: true },
    fields: 'id, name, trashed',
  });
  return response.data;
}

async function uploadToDrive({ fileName, mimeType, fileBuffer, role }) {
  const { drive } = getDriveApi();
  let targetFolderId = await getOrCreateRootFolder();

  if (role && (role === 'admin' || role === 'accountant')) {
    targetFolderId = await getOrCreateSubfolder(targetFolderId, role);
  }

  const { driveApi } = getDriveApi();
  const response = await driveApi.files.create({
    resource: { name: fileName, parents: [targetFolderId] },
    media: { mimeType, body: stream.Readable.from(fileBuffer) },
    fields: 'id, name, webViewLink, createdTime',
  });

  await shareWithEmail(response.data.id, drive.userEmail);
  return response.data;
}

async function listDriveStructure() {
  const { drive } = getDriveApi();

  let rootId;
  try {
    rootId = drive.folderId || await getOrCreateRootFolder();
  } catch (err) {
    console.error('Drive structure error:', err.message);
    return { root: [], admin: [], accountant: [], common: [] };
  }

  const rootFiles = await listFiles(rootId);

  let adminFolderId = null;
  let accountantFolderId = null;
  let commonFolderId = null;

  for (const f of rootFiles) {
    if (f.name === 'admin' && f.mimeType === 'application/vnd.google-apps.folder') adminFolderId = f.id;
    if (f.name === 'accountant' && f.mimeType === 'application/vnd.google-apps.folder') accountantFolderId = f.id;
    if (f.name === 'Common' && f.mimeType === 'application/vnd.google-apps.folder') commonFolderId = f.id;
  }

  const adminFiles = adminFolderId ? await listFiles(adminFolderId) : [];
  const accountantFiles = accountantFolderId ? await listFiles(accountantFolderId) : [];
  const commonFiles = commonFolderId ? await listFiles(commonFolderId) : [];

  const root = rootFiles.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

  return { root, admin: adminFiles, accountant: accountantFiles, common: commonFiles };
}

module.exports = {
  getDrive,
  getDriveApi,
  getCommonFolderId,
  getOrCreateRootFolder,
  listFiles,
  getFileInfo,
  createFolder,
  uploadFile,
  renameFile,
  moveFile,
  copyFile,
  trashFile,
  uploadToDrive,
  listDriveStructure,
  getOrCreateSubfolder,
};
