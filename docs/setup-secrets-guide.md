# How to Set Up Agent 0 — Step-by-Step Guide

This guide explains how to get each secret key the app needs.  
Read slowly. Each step has pictures described in words.  
Ask for help if something looks different on your screen.

---

## What is a "Secret"?

A secret is like a password. It tells the app:
- Which WhatsApp account to use
- Which Google Sheet to write to
- Who is allowed to see the dashboard

You will type each secret into the Replit "Secrets" panel (left side of the screen, looks like a lock icon 🔒).

---

## List of Secrets

| Secret Name | What it does | Where to get it |
|---|---|---|
| `ADMIN_PASSWORD` | Protects the dashboard | You choose it |
| `WHATSAPP_VERIFY_TOKEN` | Proves your server to Meta | You choose it |
| `WHATSAPP_APP_SECRET` | Checks WhatsApp messages are real | Meta Developer Portal |
| `WHATSAPP_ACCESS_TOKEN` | Lets the app send WhatsApp messages | Meta Developer Portal |
| `WHATSAPP_PHONE_NUMBER_ID` | Your WhatsApp business number | Meta Developer Portal |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Lets the app write to Google Sheets | Google Cloud Console |
| `GOOGLE_SHEET_ID` | Which spreadsheet to use | Google Sheets URL |
| `GOOGLE_DRIVE_FOLDER_ID` | Which Drive folder to watch for PDFs | Google Drive URL |

---

## Secret 1 — ADMIN_PASSWORD

**You choose this yourself.** It is the password to open the dashboard.

Example: `Trial2024`

Rules:
- No spaces
- Use letters and numbers only
- Do not share it with participants

**Steps:**
1. Think of a password
2. In Replit, click Secrets (lock icon on the left)
3. Click **+ New Secret**
4. Name: `ADMIN_PASSWORD`
5. Value: your password
6. Click **Save**

---

## Secret 2 — WHATSAPP_VERIFY_TOKEN

**You choose this yourself.** It can be any random word or phrase. You will use it again later when setting up the Meta webhook.

Example: `guttrialbot2024`

**Steps:**
1. Think of a random word (no spaces)
2. Save it somewhere (you will need it again in Meta)
3. Add to Replit Secrets:
   - Name: `WHATSAPP_VERIFY_TOKEN`
   - Value: your random word

---

## Secrets 3, 4, 5 — WhatsApp (from Meta Developer Portal)

These three come from the same place: **Meta for Developers**.

### Step A — Create a Meta Developer Account

1. Go to: **https://developers.facebook.com**
2. Click **Get Started** (top right)
3. Sign in with your Facebook account
4. Follow the steps to register as a developer (just click Next/Agree)

### Step B — Create a Meta App

1. On the dashboard, click **Create App**
2. Choose **Business** as the app type → click **Next**
3. Give it a name, example: `GutTrialBot`
4. Click **Create App**

### Step C — Add WhatsApp to the App

1. In your app dashboard, scroll down to find **WhatsApp**
2. Click **Set up** next to WhatsApp
3. You will see the **WhatsApp API Setup** page

### Step D — Get Your Three Secrets

On the **WhatsApp > API Setup** page, you will see:

**Phone Number ID**
- Look for a box labelled **Phone number ID**
- Copy the number (looks like: `123456789012345`)
- Save in Replit as `WHATSAPP_PHONE_NUMBER_ID`

**Access Token (Temporary)**
- Look for a box labelled **Temporary access token**
- Click the copy icon next to it
- Save in Replit as `WHATSAPP_ACCESS_TOKEN`

> ⚠️ This token expires in 24 hours. For permanent use, you must create a **System User token** (see extra steps below).

**App Secret**
1. In the left menu, click **App Settings > Basic**
2. Find the field **App secret**
3. Click **Show** → enter your Facebook password
4. Copy the value
5. Save in Replit as `WHATSAPP_APP_SECRET`

---

### How to Get a Permanent Access Token (System User)

The temporary token above stops working after 24 hours. Do this to get one that never expires:

1. Go to **https://business.facebook.com**
2. Click **Settings** (gear icon, bottom left)
3. Click **System Users** (left menu)
4. Click **Add** → name it `AgentBot` → role: **Admin** → click **Create System User**
5. Click the system user you just created → click **Add Assets**
6. Select your WhatsApp app → give it **Full control** → click **Save**
7. Click **Generate New Token** → select your app → tick these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
8. Click **Generate Token** → copy it
9. Save in Replit as `WHATSAPP_ACCESS_TOKEN` (replace the old one)

---

### Set Up the Webhook (So WhatsApp Sends Messages to Your App)

1. In the Meta app, go to **WhatsApp > Configuration**
2. Under **Webhook**, click **Edit**
3. Fill in:
   - **Callback URL**: your Replit app URL + `/api/whatsapp/webhook`  
     Example: `https://your-repl-name.replit.app/api/whatsapp/webhook`
   - **Verify token**: the same value you used for `WHATSAPP_VERIFY_TOKEN`
4. Click **Verify and Save**
5. Under **Webhook fields**, find **messages** → click **Subscribe**

---

## Secret 6 — GOOGLE_SERVICE_ACCOUNT_JSON

This lets the app write lab results to Google Sheets without needing anyone to log in.

### Step A — Create a Google Cloud Project

1. Go to: **https://console.cloud.google.com**
2. Sign in with your Google account (the same one that owns the spreadsheet)
3. At the top, click the project dropdown → click **New Project**
4. Name: `AgentZero` → click **Create**

### Step B — Enable APIs

1. In the left menu, click **APIs & Services > Library**
2. Search for `Google Sheets API` → click it → click **Enable**
3. Go back to Library
4. Search for `Google Drive API` → click it → click **Enable**

### Step C — Create a Service Account

1. In the left menu, click **APIs & Services > Credentials**
2. Click **+ Create Credentials** → choose **Service Account**
3. Name: `agent-zero-bot` → click **Create and Continue**
4. Role: choose **Editor** → click **Continue** → click **Done**

### Step D — Download the JSON Key

1. On the Credentials page, click the service account you just created
2. Click the **Keys** tab (at the top)
3. Click **Add Key > Create new key**
4. Choose **JSON** → click **Create**
5. A file downloads to your computer (name like `agentZero-xxxxx.json`)

### Step E — Convert the JSON to Base64

You must convert the file to a one-line text string. Use any of these methods:

**Method 1 — On Mac:**
1. Open Terminal
2. Type: `base64 -i ~/Downloads/agentZero-xxxxx.json` (use your actual filename)
3. Press Enter
4. A long text string appears — copy all of it

**Method 2 — On Windows:**
1. Open PowerShell
2. Type: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\YourName\Downloads\agentZero-xxxxx.json"))`
3. Press Enter — copy the output

**Method 3 — Online tool (easiest):**
1. Go to: **https://www.base64encode.org**
2. Click **Choose File** → select your downloaded JSON file
3. Click **Encode** → copy the result

6. Save in Replit as `GOOGLE_SERVICE_ACCOUNT_JSON` — paste the long text as the value

### Step F — Share the Spreadsheet with the Service Account

1. Open the JSON file you downloaded (use Notepad or TextEdit)
2. Find the line that says `"client_email":`
3. Copy the email address (looks like: `agent-zero-bot@agentZero-xxxxx.iam.gserviceaccount.com`)
4. Open your Google Sheet
5. Click **Share** (top right)
6. Paste the email → role: **Editor** → click **Send**

Do the same for the Google Drive folder if you are using one.

---

## Secret 7 — GOOGLE_SHEET_ID

This is taken from the URL of your spreadsheet.

**Steps:**
1. Open your Google Sheet in Chrome
2. Look at the URL in the address bar. It looks like:
   ```
   https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
   ```
3. The ID is the part between `/d/` and `/edit`
   In this example: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`
4. Copy that part
5. Save in Replit as `GOOGLE_SHEET_ID`

---

## Secret 8 — GOOGLE_DRIVE_FOLDER_ID

Only needed if you want to watch a Drive folder for uploaded PDFs.

**Steps:**
1. Open the Google Drive folder in Chrome
2. Look at the URL:
   ```
   https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
   ```
3. The ID is the part after `/folders/`
4. Copy it
5. Save in Replit as `GOOGLE_DRIVE_FOLDER_ID`

---

## Final Checklist

Before going live, confirm all 8 secrets are saved in Replit:

- [ ] `ADMIN_PASSWORD` — dashboard password (you chose it)
- [ ] `WHATSAPP_VERIFY_TOKEN` — random word (you chose it)
- [ ] `WHATSAPP_APP_SECRET` — from Meta App Settings > Basic
- [ ] `WHATSAPP_ACCESS_TOKEN` — from Meta, permanent system user token
- [ ] `WHATSAPP_PHONE_NUMBER_ID` — from Meta WhatsApp API Setup
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` — base64 of the downloaded JSON file
- [ ] `GOOGLE_SHEET_ID` — from the Google Sheet URL
- [ ] `GOOGLE_DRIVE_FOLDER_ID` — from the Google Drive folder URL (optional)

After saving all secrets, click **Restart** on the API Server workflow in Replit.  
The app will read the new values and start working.

---

## Common Problems

**"The webhook verification failed"**  
→ Make sure the `WHATSAPP_VERIFY_TOKEN` in Replit exactly matches what you typed in Meta. No spaces, same uppercase/lowercase.

**"The Google Sheet is not updating"**  
→ Check that you shared the sheet with the service account email (Step F above).

**"Dashboard says 401 Unauthorized"**  
→ The password you typed is wrong. Clear the browser cache and try again with the exact `ADMIN_PASSWORD` you saved.

**"Access token expired"**  
→ You used the 24-hour temporary token. Follow the System User steps above to get a permanent one.
