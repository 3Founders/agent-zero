# How to Set Up Agent 0 — Step-by-Step Guide

This guide explains how to connect your WhatsApp and Google accounts to Agent 0.

There are two ways to set up:
- **Option A — Setup Wizard (recommended):** Use the in-app wizard. No terminal, no copy-pasting long codes.
- **Option B — Replit Secrets (for deployed apps):** Paste values directly into Replit's Secrets panel.

---

## Option A — Setup Wizard (Recommended)

Open the dashboard in your browser. If the app is not yet configured, it will show the setup wizard automatically. You can also open it any time by clicking the **Settings** icon in the top-right corner of the dashboard.

The wizard has 5 steps:

---

### Step 1 — Connect Google (upload JSON key)

The app needs to write lab results to a Google Sheet. To allow this, you need to create a "service account" in Google Cloud — a special Google account just for apps.

**Create the service account:**

1. Go to: **https://console.cloud.google.com**
2. Sign in with your Google account
3. Click the project name at the top → **New Project** → name it `AgentZero` → click **Create**
4. In the left menu: **APIs & Services > Library**
5. Search `Google Sheets API` → click it → click **Enable**
6. Search `Google Drive API` → click it → click **Enable**
7. In the left menu: **APIs & Services > Credentials**
8. Click **+ Create Credentials** → choose **Service Account**
9. Name: `agent-zero-bot` → click **Create and Continue** → Role: **Editor** → **Done**
10. Click the service account you just created → **Keys** tab → **Add Key > Create new key** → choose **JSON** → click **Create**
11. A JSON file downloads to your computer

**In the wizard:**
1. Click the dashed box labelled "Click to upload JSON key"
2. Select the JSON file you just downloaded
3. The wizard will show the service account email (e.g. `agent-zero-bot@agentZero.iam.gserviceaccount.com`) — copy it, you need it in Step 2
4. Click **Next**

---

### Step 2 — Connect your spreadsheet

1. Create a new Google Sheet (or open an existing one) at **https://sheets.google.com**
2. Click **Share** (top right of the sheet) → paste the service account email from Step 1 → role: **Editor** → click **Send**
3. Copy the full URL of the sheet from your browser address bar
4. Paste the URL into the wizard. The wizard will extract the ID automatically.
5. Click **Test connection** — you will see a green message like "Connected: My Trial Results" if it works
6. Click **Next**

---

### Step 3 — Watch a Drive folder (optional)

Only needed if participants will upload PDF reports to a shared Google Drive folder.

1. Open the Google Drive folder in your browser
2. Copy the full URL from the address bar
3. Paste it into the wizard. The wizard extracts the folder ID automatically.
4. Click **Next** (or click **Skip** if you don't need this)

---

### Step 4 — Connect WhatsApp

You need a Meta Developer account and a WhatsApp Business number.

**Create a Meta Developer account (if you don't have one):**

1. Go to: **https://developers.facebook.com**
2. Click **Get Started** → sign in with Facebook → follow the steps

**Create a Meta App:**

1. On the dashboard, click **Create App** → choose **Business** → name it `GutTrialBot` → click **Create App**
2. Scroll down to **WhatsApp** → click **Set up**

**Get your 4 values from the WhatsApp API Setup page:**

| Field | Where to find it |
|---|---|
| Access Token | Temporary access token box on API Setup page (see permanent token steps below) |
| Phone Number ID | "Phone number ID" box on API Setup page |
| Verify Token | A random word you choose yourself (e.g. `guttrialbot2024`) |
| App Secret | App Settings > Basic > App secret > click Show |

**Paste all 4 values** into the wizard. Click **Test connection** — you will see your WhatsApp number if the token is valid.

Click **Next**.

> **Make the Access Token permanent (important!):**
> The temporary token expires in 24 hours. To get a permanent one:
> 1. Go to **https://business.facebook.com** > Settings > System Users
> 2. Click **Add** → name it `AgentBot` → role: **Admin**
> 3. Click the user → **Add Assets** → select your WhatsApp app → **Full control**
> 4. Click **Generate New Token** → select your app → tick `whatsapp_business_messaging` and `whatsapp_business_management`
> 5. Copy the token and paste it back into the wizard (Settings → Step 4)

---

### Step 5 — Set a dashboard password

Choose a password for the dashboard. Anyone who knows this password can view the extraction history and system status.

- Type your password and confirm it
- Click **Finish setup**

The wizard will save all your settings and open the dashboard.

---

### Set up the WhatsApp Webhook (one-time step after finishing the wizard)

For WhatsApp to send messages to your app, you need to register a webhook in Meta:

1. In the Meta app, go to **WhatsApp > Configuration**
2. Under **Webhook**, click **Edit**
3. **Callback URL**: your Replit app URL + `/api/whatsapp/webhook`
   Example: `https://your-repl-name.replit.app/api/whatsapp/webhook`
4. **Verify token**: the same value you entered in Step 4 above
5. Click **Verify and Save**
6. Under **Webhook fields**, find **messages** → click **Subscribe**

---

## Option B — Replit Secrets (for production deployments)

If you have deployed the app (published it), you can set credentials via Replit Secrets instead of the wizard. Values in Replit Secrets always take priority over the wizard settings.

Go to the Secrets panel in Replit (lock icon on the left) and add:

| Secret | Value |
|---|---|
| `ADMIN_PASSWORD` | Your chosen dashboard password |
| `WHATSAPP_VERIFY_TOKEN` | Your chosen verify token (random word) |
| `WHATSAPP_APP_SECRET` | From Meta: App Settings > Basic > App secret |
| `WHATSAPP_ACCESS_TOKEN` | Permanent system-user token from Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta: WhatsApp > API Setup |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64-encoded service-account JSON (see below) |
| `GOOGLE_SHEET_ID` | ID from your Google Sheet URL (between `/d/` and `/edit`) |
| `GOOGLE_DRIVE_FOLDER_ID` | ID from your Drive folder URL (after `/folders/`) |

**Converting the JSON file to base64 (required for Secrets only):**

- **Mac/Linux:** Open Terminal → `base64 -i ~/Downloads/your-key.json`
- **Windows:** Open PowerShell → `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\your-key.json"))`
- **Online:** Go to https://www.base64encode.org → upload the file → copy the result

After saving all secrets, restart the API Server workflow in Replit.

---

## Common Problems

**"Sheet not found" or "Access denied" in Step 2**
→ You forgot to share the sheet with the service account email. Go to the sheet → Share → paste the email → Editor → Send.

**"Token is invalid" in Step 4**
→ The access token expired (24-hour limit) or was copied incorrectly. Generate a permanent System User token (see Step 4 instructions above).

**"Webhook verification failed" in Meta**
→ The Verify Token you typed in Meta does not match what you entered in the wizard. Open Settings in the dashboard and check Step 4.

**Dashboard shows 401 Unauthorized after finishing setup**
→ Your browser has the old password cached. Clear the site data in your browser and log in again.
