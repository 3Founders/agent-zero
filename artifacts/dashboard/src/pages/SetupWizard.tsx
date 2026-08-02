import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { extractSheetId, extractDriveFolderId } from '@/utils/urlParsers';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SetupWizardProps {
  onComplete?: () => void;
}

/** Styled external link used inside wizard steps. */
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  );
}

/** Numbered instruction list shown inside wizard steps. */
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 text-sm text-muted-foreground list-none">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-foreground text-xs font-semibold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="leading-snug">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** Build fetch headers including Basic auth if a password is already stored. */
function setupHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const stored = localStorage.getItem('adminPassword');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (stored) {
    headers['Authorization'] = 'Basic ' + btoa('admin:' + stored);
  }
  return headers;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  
  // Accumulated state
  const [serviceAccountJson, setServiceAccountJson] = useState<string>('');
  const [clientEmail, setClientEmail] = useState<string>('');
  
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetId, setSheetId] = useState('');
  const [sheetTitle, setSheetTitle] = useState('');
  
  const [driveUrl, setDriveUrl] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');
  
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [waVerifiedName, setWaVerifiedName] = useState('');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Loading states for tests and submit
  const [testingSheet, setTestingSheet] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [sheetError, setSheetError] = useState('');
  const [waError, setWaError] = useState('');
  
  // Handlers for Step 1
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json = JSON.parse(text);
        if (!json.client_email) {
          toast({
            title: "Invalid file",
            description: "No client_email found in JSON.",
            variant: "destructive"
          });
          return;
        }
        setClientEmail(json.client_email);
        setServiceAccountJson(btoa(text));
      } catch (err) {
        toast({
          title: "Invalid file",
          description: "Could not parse JSON.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const handleNextStep1 = () => {
    setStep(2);
  };

  // Handlers for Step 2
  const handleSheetUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setSheetUrl(url);
    setSheetId(extractSheetId(url) || '');
    setSheetTitle('');
    setSheetError('');
  };

  const testGoogleSheet = async () => {
    setTestingSheet(true);
    setSheetError('');
    try {
      const res = await fetch('/api/admin/setup/test-google', {
        method: 'POST',
        headers: setupHeaders(),
        body: JSON.stringify({ serviceAccountJson, sheetId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSheetTitle(data.sheetTitle || 'Connected successfully');
      } else {
        setSheetError(data.error || 'Connection failed');
      }
    } catch (err) {
      setSheetError('Network error testing connection');
    } finally {
      setTestingSheet(false);
    }
  };

  const handleNextStep2 = () => {
    setStep(3);
  };

  // Handlers for Step 3
  const handleDriveUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setDriveUrl(url);
    setDriveFolderId(extractDriveFolderId(url) || '');
  };

  const handleNextStep3 = () => {
    setStep(4);
  };
  
  const handleSkipStep3 = () => {
    setDriveFolderId('');
    setDriveUrl('');
    setStep(4);
  };

  // Handlers for Step 4
  const testWhatsApp = async () => {
    setTestingWa(true);
    setWaError('');
    try {
      const res = await fetch('/api/admin/setup/test-whatsapp', {
        method: 'POST',
        headers: setupHeaders(),
        body: JSON.stringify({ accessToken, phoneNumberId }),
      });
      const data = await res.json();
      if (data.ok) {
        setWaVerifiedName(data.displayPhoneNumber || data.verifiedName || 'Connected successfully');
      } else {
        setWaError(data.error || 'Connection failed');
      }
    } catch (err) {
      setWaError('Network error testing connection');
    } finally {
      setTestingWa(false);
    }
  };

  const handleNextStep4 = () => {
    setStep(5);
  };

  // Handlers for Step 5
  const submitConfig = async (skipPassword = false) => {
    if (!skipPassword && password !== confirmPassword) {
      toast({
        title: "Password mismatch",
        description: "The entered passwords do not match.",
        variant: "destructive"
      });
      return;
    }
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/setup/config', {
        method: 'PUT',
        headers: setupHeaders(),
        body: JSON.stringify({
          GOOGLE_SERVICE_ACCOUNT_JSON: serviceAccountJson,
          GOOGLE_SHEET_ID: sheetId,
          GOOGLE_DRIVE_FOLDER_ID: driveFolderId || undefined,
          WHATSAPP_ACCESS_TOKEN: accessToken,
          WHATSAPP_PHONE_NUMBER_ID: phoneNumberId,
          WHATSAPP_VERIFY_TOKEN: verifyToken,
          WHATSAPP_APP_SECRET: appSecret,
          ADMIN_PASSWORD: skipPassword ? undefined : password || undefined,
        }),
      });
      
      if (res.ok) {
        if (!skipPassword && password) {
          localStorage.setItem('adminPassword', password);
        }
        if (onComplete) onComplete();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "Save failed",
          description: data.error || "An unknown error occurred.",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Network Error",
        description: "Failed to save configuration.",
        variant: "destructive"
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-foreground">
      <div className="w-full max-w-lg space-y-6">
        
        {/* Progress indicator */}
        <div className="flex items-center justify-between text-sm font-medium text-muted-foreground px-1">
          <span>Step {step} of 5</span>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div 
                key={i} 
                className={`h-1.5 w-8 rounded-full transition-colors ${i === step ? 'bg-primary' : i < step ? 'bg-primary/50' : 'bg-muted'}`}
              />
            ))}
          </div>
        </div>

        <Card className="shadow-sm border-border">
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle>Connect Google</CardTitle>
                <CardDescription>
                  Download your service-account JSON key from Google Cloud Console, then upload it here. No base64 or terminal needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Steps items={[
                  <><A href="https://console.cloud.google.com">Open Google Cloud Console</A> → sign in → click your project name at the top → <strong>New Project</strong> → name it anything → <strong>Create</strong></>,
                  <><A href="https://console.cloud.google.com/apis/library/sheets.googleapis.com">Enable Google Sheets API</A> and <A href="https://console.cloud.google.com/apis/library/drive.googleapis.com">Google Drive API</A></>,
                  <>Go to <A href="https://console.cloud.google.com/iam-admin/serviceaccounts">Service Accounts</A> → <strong>+ Create Service Account</strong> → any name → Role: <strong>Editor</strong> → <strong>Done</strong></>,
                  <>Click the new service account → <strong>Keys</strong> tab → <strong>Add Key → Create new key → JSON</strong> → a file downloads to your computer</>,
                  <>Click the box below and select that downloaded file</>,
                ]} />

                <div className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center relative hover:bg-muted/30 transition-colors text-center">
                  <UploadCloud className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">Click to upload JSON key</p>
                  <p className="text-xs text-muted-foreground">.json files only</p>
                  <input 
                    type="file" 
                    accept=".json" 
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileUpload}
                  />
                </div>
                
                {clientEmail && (
                  <div className="bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 p-3 rounded-md flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Valid JSON loaded</p>
                      <p className="text-xs mt-1 opacity-80 break-all">Service account: {clientEmail}</p>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-end border-t border-border pt-4 pb-4">
                <Button onClick={handleNextStep1} disabled={!clientEmail}>
                  Next
                </Button>
              </CardFooter>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle>Connect your spreadsheet</CardTitle>
                <CardDescription>
                  Paste the full URL of the Google Sheet where lab results will be saved. Then share the sheet with the service account email.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 p-3 rounded-md border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Share your sheet with:</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 truncate">{clientEmail}</code>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(clientEmail);
                        toast({ description: "Email copied to clipboard" });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                
                <Steps items={[
                  <><A href="https://sheets.new">Create a new Google Sheet</A> (or open an existing one)</>,
                  <>Click <strong>Share</strong> (top-right of the sheet) → paste the service account email above → role: <strong>Editor</strong> → <strong>Send</strong></>,
                  <>Copy the full URL from your browser and paste it below</>,
                ]} />

                <div className="space-y-2">
                  <Label htmlFor="sheetUrl">Spreadsheet URL</Label>
                  <Input 
                    id="sheetUrl" 
                    placeholder="https://docs.google.com/spreadsheets/d/..." 
                    value={sheetUrl}
                    onChange={handleSheetUrlChange}
                  />
                  {sheetUrl && (
                    <div className="text-xs mt-1">
                      {sheetId ? (
                        <span className="text-teal-600 dark:text-teal-400">Extracted ID: {sheetId}</span>
                      ) : (
                        <span className="text-destructive">Invalid Google Sheets URL</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <Button 
                    variant="secondary" 
                    onClick={testGoogleSheet} 
                    disabled={!sheetId || testingSheet}
                    className="w-full"
                  >
                    {testingSheet && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Test Connection
                  </Button>
                </div>

                {sheetTitle && (
                  <div className="bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 p-3 rounded-md flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">Connected: {sheetTitle}</span>
                  </div>
                )}
                
                {sheetError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-md flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">{sheetError}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-between border-t border-border pt-4 pb-4">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={handleNextStep2} disabled={!sheetTitle}>
                  Next
                </Button>
              </CardFooter>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle>Watch a Drive folder (optional)</CardTitle>
                <CardDescription>
                  If participants will upload PDFs to a shared Google Drive folder, paste its URL here. Skip this step if you're only using WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Steps items={[
                  <><A href="https://drive.google.com">Open Google Drive</A> → find or create the folder where participants will upload PDFs</>,
                  <>Right-click the folder → <strong>Share</strong> → paste the service account email from Step 1 → <strong>Editor</strong> → <strong>Send</strong></>,
                  <>Open the folder → copy the full URL from your browser and paste it below</>,
                ]} />

                <div className="space-y-2">
                  <Label htmlFor="driveUrl">Google Drive Folder URL</Label>
                  <Input 
                    id="driveUrl" 
                    placeholder="https://drive.google.com/drive/folders/..." 
                    value={driveUrl}
                    onChange={handleDriveUrlChange}
                  />
                  {driveUrl && (
                    <div className="text-xs mt-1">
                      {driveFolderId ? (
                        <span className="text-teal-600 dark:text-teal-400">Extracted ID: {driveFolderId}</span>
                      ) : (
                        <span className="text-destructive">Invalid Google Drive Folder URL</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t border-border pt-4 pb-4">
                <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleSkipStep3}>Skip</Button>
                  <Button onClick={handleNextStep3} disabled={driveUrl.length > 0 && !driveFolderId}>
                    Next
                  </Button>
                </div>
              </CardFooter>
            </>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle>Connect WhatsApp</CardTitle>
                <CardDescription>
                  Get these values from the Meta Developer Portal &rarr; Your App &rarr; WhatsApp &rarr; API Setup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Steps items={[
                  <><A href="https://developers.facebook.com/apps">Open Meta Developer Portal</A> → sign in with Facebook → click your app (or <A href="https://developers.facebook.com/apps/creation">create a new one</A> → type: <strong>Business</strong>)</>,
                  <>In your app, scroll to <strong>WhatsApp</strong> → <strong>Set up</strong> → go to <strong>API Setup</strong></>,
                  <><strong>Access Token</strong>: copy the temporary token shown on the API Setup page (see note below for a permanent one)</>,
                  <><strong>Phone Number ID</strong>: shown just above the token on the same page</>,
                  <><strong>Verify Token</strong>: make up any word you'll remember — e.g. <code className="text-xs bg-muted px-1 rounded">guttrialbot2024</code></>,
                  <><strong>App Secret</strong>: go to <A href="https://developers.facebook.com/apps">your app</A> → <strong>App Settings → Basic</strong> → click <strong>Show</strong> next to App secret</>,
                ]} />

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 p-3 rounded-md text-xs leading-relaxed">
                  <strong>Make your token permanent</strong> — the temporary token expires in 24 hours.{' '}
                  <A href="https://business.facebook.com/settings/system-users">Open Business Settings → System Users</A> → Add → role: Admin → Add Assets → select your WhatsApp app → Generate New Token → tick <code className="bg-muted/50 px-1 rounded">whatsapp_business_messaging</code>. Paste that token above.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token</Label>
                  <Textarea 
                    id="accessToken" 
                    placeholder="EAABabc..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                  <Input 
                    id="phoneNumberId" 
                    placeholder="123456789012345" 
                    value={phoneNumberId}
                    onChange={(e) => setPhoneNumberId(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="verifyToken">Verify Token</Label>
                  <Input 
                    id="verifyToken" 
                    placeholder="Your chosen verify token" 
                    value={verifyToken}
                    onChange={(e) => setVerifyToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">You will use this again in Meta when setting up the webhook.</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="appSecret">App Secret</Label>
                  <Input 
                    id="appSecret" 
                    type="password"
                    placeholder="From App Settings → Basic → App secret" 
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                  <Button 
                    variant="secondary" 
                    onClick={testWhatsApp} 
                    disabled={!accessToken || !phoneNumberId || testingWa}
                    className="w-full"
                  >
                    {testingWa && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Test Connection
                  </Button>
                </div>

                {waVerifiedName && (
                  <div className="bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-300 p-3 rounded-md flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">Connected: {waVerifiedName}</span>
                  </div>
                )}
                
                {waError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-md flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-medium truncate">{waError}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-between border-t border-border pt-4 pb-4">
                <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(5)}>Skip</Button>
                  <Button onClick={handleNextStep4} disabled={!accessToken || !phoneNumberId || !verifyToken || !appSecret}>
                    Next
                  </Button>
                </div>
              </CardFooter>
            </>
          )}

          {/* STEP 5 */}
          {step === 5 && (
            <>
              <CardHeader>
                <CardTitle>Set your dashboard password</CardTitle>
                <CardDescription>
                  Choose a password to protect this dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input 
                    id="password" 
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input 
                    id="confirmPassword" 
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive font-medium">Passwords do not match.</p>
                )}
              </CardContent>
              <CardFooter className="justify-between border-t border-border pt-4 pb-4">
                <Button variant="ghost" onClick={() => setStep(4)} disabled={submitting}>Back</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => submitConfig(true)} disabled={submitting}>
                    Skip (No password)
                  </Button>
                  <Button onClick={() => submitConfig(false)} disabled={!password || password !== confirmPassword || submitting}>
                    {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Finish Setup
                  </Button>
                </div>
              </CardFooter>
            </>
          )}

        </Card>
      </div>
    </div>
  );
}
