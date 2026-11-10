# Trust CRM: Google Secret Manager + Render Production Guide

This guide configures the WhatsApp session encryption key in Google Secret Manager,
allows the Render backend to read it securely, and verifies the OCR/CRM deployment.

## 1. Final architecture

```text
Browser / Vercel frontend
        |
        v
Render backend (Trust CRM API)
        |-- Supabase: database, Auth, Storage
        |-- Google Secret Manager: WhatsApp encryption secret
        |-- Google Drive: existing service-account integration
        |-- WhatsApp Web: optional admin/accountant feature
```

The browser never receives the WhatsApp key. The backend reads the latest secret version
using the existing Google service account. The key is used only for AES-256-GCM encryption
of WhatsApp session files.

The OCR feature does not require WhatsApp or Google Secret Manager. If the secret manager
is temporarily unavailable, the CRM and OCR routes can start; only WhatsApp connection is
disabled until the secret is available.

## 2. Values and roles

Use one Google Cloud project for the existing Drive service account and Secret Manager.

You need:

| Value | Where it is used |
|---|---|
| `GOOGLE_CLOUD_PROJECT_ID` | Render backend configuration |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Render backend authentication |
| `GOOGLE_PRIVATE_KEY` | Render backend authentication; keep private |
| `WA_SESSION_KEY_SECRET_NAME` | Render backend; default is `trust-crm-wa-session-encryption-key` |
| `GOOGLE_DRIVE_*` variables | Existing Drive integration |

The service account needs:

- Existing Drive permissions required by Trust CRM.
- `roles/secretmanager.secretAccessor` on the Google Cloud project or on the individual secret.

Do not grant the service account project Owner or Editor just for this feature.

## 3. Google Cloud setup

Run these commands from a terminal where `gcloud` is authenticated as a project administrator.
Replace the placeholders; never commit the generated key or a service-account JSON file.

```bash
PROJECT_ID="YOUR_GOOGLE_PROJECT_ID"
SERVICE_ACCOUNT_EMAIL="YOUR_SERVICE_ACCOUNT_EMAIL"
SECRET_NAME="trust-crm-wa-session-encryption-key"

gcloud config set project "$PROJECT_ID"
gcloud services enable secretmanager.googleapis.com --project "$PROJECT_ID"

gcloud secrets describe "$SECRET_NAME" --project "$PROJECT_ID" >/dev/null 2>&1 || \
  gcloud secrets create "$SECRET_NAME" \
    --replication-policy=automatic \
    --project "$PROJECT_ID"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/secretmanager.secretAccessor"

KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
printf '%s' "$KEY" | gcloud secrets versions add "$SECRET_NAME" \
  --data-file=- \
  --project "$PROJECT_ID"
unset KEY
```

The stored value is a 64-character hexadecimal key. The command intentionally does not
print the key. Keep a secure backup in a password manager. Do not put it in GitHub, a source
file, a browser environment variable, or a chat message.

### PowerShell version

```powershell
$ProjectId = "YOUR_GOOGLE_PROJECT_ID"
$ServiceAccountEmail = "YOUR_SERVICE_ACCOUNT_EMAIL"
$SecretName = "trust-crm-wa-session-encryption-key"

gcloud config set project $ProjectId
gcloud services enable secretmanager.googleapis.com --project $ProjectId

gcloud secrets describe $SecretName --project $ProjectId 2>$null
if ($LASTEXITCODE -ne 0) {
  gcloud secrets create $SecretName --replication-policy=automatic --project $ProjectId
}

gcloud projects add-iam-policy-binding $ProjectId `
  --member="serviceAccount:$ServiceAccountEmail" `
  --role="roles/secretmanager.secretAccessor"

$Key = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$TempKeyFile = Join-Path $env:TEMP "trust-crm-wa-key.txt"
[System.IO.File]::WriteAllBytes($TempKeyFile, [System.Text.Encoding]::UTF8.GetBytes($Key.Trim()))
gcloud secrets versions add $SecretName --data-file=$TempKeyFile --project $ProjectId
Remove-Item -LiteralPath $TempKeyFile -Force
Remove-Variable Key
```

Verify only the secret metadata, not the secret value:

```bash
gcloud secrets describe trust-crm-wa-session-encryption-key \
  --project YOUR_GOOGLE_PROJECT_ID

gcloud secrets versions list trust-crm-wa-session-encryption-key \
  --project YOUR_GOOGLE_PROJECT_ID
```

## 4. Render configuration

Open **Render → trust-crm-backend → Environment** and confirm these values:

```text
GOOGLE_CLOUD_PROJECT_ID=YOUR_GOOGLE_PROJECT_ID
WA_SESSION_KEY_SECRET_NAME=trust-crm-wa-session-encryption-key
GOOGLE_SERVICE_ACCOUNT_EMAIL=the-existing-service-account-email
GOOGLE_PRIVATE_KEY=the-existing-private-key
```

Do not set `WA_SESSION_ENCRYPTION_KEY` in Render when using Google Secret Manager. If an old
placeholder or invalid value exists, remove it. The backend uses a direct environment value
only as a local-development fallback; otherwise it reads Google Secret Manager.

The repository `render.yaml` declares the non-secret configuration names. Render still needs
the actual service-account values in its dashboard because secrets must not be committed.

After changing Render variables, save the changes and deploy the latest `main` commit.

## 5. Deploy order

Use this order so each layer can be verified before the next one:

1. Google Cloud API, secret, and IAM role.
2. Render environment variables.
3. Latest backend deployment.
4. Backend health and route checks.
5. Latest Vercel production deployment.
6. Browser login and OCR smoke test.

The Google Secret Manager implementation is currently in the local workspace. It must be
committed and pushed before Render can deploy it. Do not deploy an older commit that still
imports the encryption key synchronously and crashes when the direct Render variable is empty.

## 6. Render verification

Open:

```text
https://trust-crm-b8rn.onrender.com/health
```

After the new backend is deployed, the response should include:

```json
{
  "status": "ok",
  "commit": "<deployed-commit>",
  "expense_scan_route": true,
  "whatsapp_secret": {
    "initialized": true,
    "source": "google-secret-manager:trust-crm-wa-session-encryption-key"
  }
}
```

The commit value must match the commit shown in Render's deployment details.

Then check the protected OCR route without an authorization header:

```text
https://trust-crm-b8rn.onrender.com/api/expense-scans
```

Expected result:

```json
{"success":false,"message":"Missing auth token"}
```

Expected status is **401**. A **404** means Render is still serving an old build, wrong
repository, wrong branch, or wrong service.

In Render logs, look for:

```text
[whatsappCrypto] encryption key loaded from google-secret-manager:trust-crm-wa-session-encryption-key
```

If the backend starts but this line does not appear, WhatsApp may not be configured even
though the rest of the CRM is healthy.

## 7. Vercel verification

Deploy the same current `main` commit to Vercel production. Confirm:

```text
Repository: Saipremakuteeram-orgin/trust-crm
Production branch: main
Root directory: frontend
Build command: npm run build
```

Confirm the custom domain is attached to the production deployment, not an old preview:

```text
https://crmsaidharmasamrakshanapremakuteeram.dpdns.org
```

Hard-refresh the browser after deployment:

```text
Ctrl + Shift + R
```

The browser should load the OCR files successfully:

```text
/ocr-models/PP-OCRv5_mobile_det.tar
/ocr-models/ta_PP-OCRv5_mobile_rec.tar
```

## 8. Supabase verification

Google Secret Manager does not require a Supabase migration. The OCR migration still needs
to have been applied once:

```sql
select
  to_regclass('public.expense_scans') as expense_scans,
  to_regclass('public.expense_scan_items') as expense_scan_items,
  to_regprocedure(
    'public.approve_expense_scan(uuid,uuid,text,date,text,text,boolean,uuid,uuid,uuid,uuid[])'
  ) as approval_function;
```

All three results should be non-null.

## 9. End-to-end smoke test

1. Sign in as an admin or accountant.
2. Open **Transactions → Scan Expense**.
3. Upload a JPEG, PNG, or WebP image under 10 MB.
4. Confirm the preview appears immediately.
5. Wait for OCR progress and ETA to complete.
6. Confirm the scan review screen appears.
7. Select an active Function/Event.
8. Select Cash or Digital.
9. For Cash, select Filed or Pending.
10. Click Approve.
11. Confirm the generated debit transaction appears in Transactions.

WhatsApp is not required for the OCR flow. If Google Secret Manager is unavailable, the CRM
and OCR endpoints remain available; only WhatsApp connection should return a configuration
error.

## 10. Rotation and recovery

Do not rotate this key casually. Existing encrypted WhatsApp session files are tied to it.
Adding a new Secret Manager version changes what the backend reads from `latest`; existing
sessions may become unreadable and require QR re-authentication.

If the key is lost:

1. Create a new 32-byte key.
2. Add it as a new Secret Manager version.
3. Redeploy/restart Render.
4. Reconnect WhatsApp and scan a new QR code.

Transactions, Supabase data, OCR models, and the expense-scan database records are not
encrypted with this WhatsApp key and are unaffected by WhatsApp key rotation.

## 11. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Render crashes with `WA_SESSION_ENCRYPTION_KEY is required` | Old backend code is deployed | Deploy the Google Secret Manager implementation |
| Health says `initialized: false` | Secret Manager request failed | Check Render logs, project ID, service-account email/private key, and IAM |
| `Permission denied` from Secret Manager | Missing IAM role | Grant `roles/secretmanager.secretAccessor` |
| `Secret not found` | Wrong project or secret name | Check `GOOGLE_CLOUD_PROJECT_ID` and `WA_SESSION_KEY_SECRET_NAME` |
| OCR route returns 404 | Old backend or wrong Render service | Verify deployed commit and `/health` response |
| OCR upload returns 401 | Browser session expired or missing auth | Sign out/in and retry |
| OCR upload returns 500 | Storage, schema, or service-role issue | Inspect Render logs and verify the OCR migration/bucket |
| WhatsApp returns 503 | Secret manager unavailable or not initialized | Fix Google IAM/configuration; do not put the key in frontend |
