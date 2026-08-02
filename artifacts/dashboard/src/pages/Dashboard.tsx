import { useState } from 'react';
import {
  useGetAdminStatus,
  getGetAdminStatusQueryKey,
  useProcessTestPdf,
  useUpdateDrivePollerInterval,
  type TestPdfResult,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RefreshCw, HardDrive, Clock, AlertCircle, CheckCircle2, Settings, LogOut, Upload, FileText, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link } from 'wouter';

interface DashboardProps {
  authHeader: string;
  onLogout: () => void;
}

const DRIVE_INTERVAL_OPTIONS = [
  { value: '900000', label: 'Every 15 minutes' },
  { value: '3600000', label: 'Every hour' },
  { value: '86400000', label: 'Once per day' },
];

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function Dashboard({ authHeader, onLogout }: DashboardProps) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<TestPdfResult | null>(null);
  // Pass the Authorization header directly via the `request` option so
  // customFetch sees `Authorization: Basic <base64>` — not a Bearer-wrapped token.
  const { data, error, isLoading, isFetching } = useGetAdminStatus({
    request: { headers: { Authorization: authHeader } },
    query: {
      queryKey: getGetAdminStatusQueryKey(),
      refetchInterval: 30_000,
      retry: (failureCount, error: any) => {
        if (error?.status === 401) return false;
        return failureCount < 3;
      }
    }
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminStatusQueryKey() });
  };
  const uploadMutation = useProcessTestPdf({
    request: { headers: { Authorization: authHeader } },
    mutation: {
      onSuccess: (result) => {
        setUploadResult(result);
        setUploadError('');
        queryClient.invalidateQueries({ queryKey: getGetAdminStatusQueryKey() });
      },
      onError: (error: any) => {
        setUploadError(error?.data?.error || error?.message || 'The test PDF could not be processed.');
      },
    },
  });
  const intervalMutation = useUpdateDrivePollerInterval({
    request: { headers: { Authorization: authHeader } },
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetAdminStatusQueryKey() }),
    },
  });

  const openTestUpload = () => {
    setParticipantId('');
    setSelectedFile(null);
    setUploadError('');
    setUploadResult(null);
    setUploadOpen(true);
  };

  const intervalError = intervalMutation.error
    ? ((intervalMutation.error as any)?.data?.error || 'Could not update the automatic scan frequency.')
    : '';

  const submitTestUpload = async () => {
    if (!participantId.trim()) {
      setUploadError('Enter the participant phone number or ID.');
      return;
    }
    if (!selectedFile) {
      setUploadError('Choose a PDF file.');
      return;
    }
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Choose a PDF file.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadError('Choose a PDF smaller than 10 MB.');
      return;
    }
    setUploadError('');
    uploadMutation.mutate({
      data: {
        participantId: participantId.trim(),
        filename: selectedFile.name,
        pdfBase64: await fileToBase64(selectedFile),
      },
    });
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-8 lg:p-12 animate-pulse">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="h-10 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-48 bg-muted rounded"></div>
            <div className="h-48 bg-muted rounded"></div>
          </div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-background p-6 flex flex-col items-center justify-center">
        <div className="flex items-center gap-3 text-destructive mb-4">
          <AlertCircle className="w-8 h-8" />
          <h2 className="text-xl font-medium">Connection Error</h2>
        </div>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          {error.message || 'Failed to connect to the server.'}
        </p>
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" /> Try Again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { drivePoller, scheduler, extractions, serverTime } = data;

  const sortedExtractions = [...extractions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 lg:p-12 text-foreground">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Agent 0 — Trial Monitor</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Last updated: {format(parseISO(serverTime), "MMM d, yyyy HH:mm:ss")}
            </p>
          </div>
          <div className="flex gap-2 shrink-0 self-start sm:self-auto">
            <Link href="/setup">
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Button onClick={openTestUpload} size="sm" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload test PDF
            </Button>
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={onLogout}
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </header>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Drive Poller Status */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-muted-foreground" />
                Drive Poller
              </CardTitle>
              <Badge variant={drivePoller.running ? "default" : "destructive"} className={drivePoller.running ? "bg-teal-700 hover:bg-teal-800 text-white border-transparent" : ""}>
                {drivePoller.running ? 'Running' : 'Stopped'}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                <div>
                  <dt className="text-muted-foreground mb-1">Processed</dt>
                  <dd className="font-mono text-lg font-medium">{drivePoller.processedCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Last Poll</dt>
                  <dd className="font-mono text-sm mt-1">
                    {drivePoller.lastPollTime ? format(parseISO(drivePoller.lastPollTime), "HH:mm:ss") : 'Never'}
                  </dd>
                </div>
                <div className="col-span-2 pt-2 border-t border-border/50">
                  <dt className="text-muted-foreground mb-2">Automatic scan frequency</dt>
                  <Select
                    value={String(drivePoller.intervalMs)}
                    onValueChange={(value) => intervalMutation.mutate({
                      data: {
                        intervalMs: Number(value) as 900000 | 3600000 | 86400000,
                      },
                    })}
                    disabled={intervalMutation.isPending || !drivePoller.folderId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a scan frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      {DRIVE_INTERVAL_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-2">
                    {drivePoller.folderId
                      ? 'New PDFs in the configured Drive folder are processed automatically.'
                      : 'Add a Google Drive folder in Settings to enable automatic scans.'}
                  </p>
                  {intervalError && <p className="text-xs text-destructive mt-2">{intervalError}</p>}
                </div>
                <div className="col-span-2 pt-2 border-t border-border/50">
                  <dt className="text-muted-foreground mb-2 flex items-center justify-between">
                    <span>Retry Queue</span>
                    <Badge variant="secondary" className="font-mono">{drivePoller.pendingRetryCount}</Badge>
                  </dt>
                  {drivePoller.pendingRetryCount > 0 ? (
                    <ul className="space-y-1 font-mono text-xs bg-muted/50 p-2 rounded border border-border">
                      {drivePoller.pendingRetryFiles.map((file, i) => (
                         <li key={i} className="truncate" title={file}>{file}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No files pending retry.</p>
                  )}
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Scheduler Status */}
          <Card className="shadow-sm border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Clock className="w-5 h-5 text-muted-foreground" />
                Reminder Scheduler
              </CardTitle>
              <Badge variant={scheduler.running ? "default" : "destructive"} className={scheduler.running ? "bg-teal-700 hover:bg-teal-800 text-white border-transparent" : ""}>
                {scheduler.running ? 'Running' : 'Stopped'}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                <div>
                  <dt className="text-muted-foreground mb-1">Active Participants</dt>
                  <dd className="font-mono text-lg font-medium">{scheduler.activeParticipantCount}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground mb-1">Timezone</dt>
                  <dd className="font-mono text-sm mt-1">{scheduler.timezone}</dd>
                </div>
                <div className="col-span-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
                  <div>
                    <dt className="text-muted-foreground mb-1">Morning Dose</dt>
                    <dd className="font-mono">{scheduler.morningTime}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground mb-1">Evening Dose</dt>
                    <dd className="font-mono">{scheduler.eveningTime}</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* Extractions Table */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium tracking-tight">Recent Extractions</h2>
          <div className="border border-border rounded-md shadow-sm overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Participant ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[30%]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedExtractions.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
                        <p>No extractions logged yet.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedExtractions.map((ex) => (
                    <TableRow key={ex.messageId} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(parseISO(ex.timestamp), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{ex.participantId}</TableCell>
                      <TableCell className="capitalize text-sm">
                        {ex.source === 'manual' ? 'Test upload' : ex.source}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {ex.rowCount !== null && ex.rowCount !== undefined ? ex.rowCount : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ex.status === 'success' ? 'default' : 'destructive'}
                          className={ex.status === 'success' ? 'bg-teal-700/10 text-teal-800 hover:bg-teal-700/20 border-teal-700/20 shadow-none' : 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20 shadow-none'}
                        >
                          {ex.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ex.reason ? (
                          <span className="text-destructive font-medium">{ex.reason}</span>
                        ) : (
                          <span className="italic">Processed successfully</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload and process a test PDF</DialogTitle>
            <DialogDescription>
              This runs the same extraction and Google Sheets sync used for participant reports.
            </DialogDescription>
          </DialogHeader>

          {uploadResult ? (
            <div className="space-y-4">
              <div className="rounded-md border border-teal-500/30 bg-teal-500/10 p-3 text-sm text-teal-800 dark:text-teal-200">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {uploadResult.rowCount} lab value{uploadResult.rowCount === 1 ? '' : 's'} extracted and saved to Google Sheets.
                </div>
                <p className="mt-1 text-xs opacity-80">Participant: {uploadResult.participantId}</p>
              </div>
              {uploadResult.rows.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Test</TableHead><TableHead>Value</TableHead><TableHead>Range</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {uploadResult.rows.map((row, index) => (
                        <TableRow key={`${row.field}-${index}`}>
                          <TableCell className="text-sm">{row.field}</TableCell>
                          <TableCell className="font-mono text-sm">{row.value ?? '—'} {row.unit ?? ''}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.referenceRange ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No lab values were found in this PDF. Nothing was added to the sheet.</p>
              )}
              <DialogFooter>
                <Button onClick={() => setUploadOpen(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="participantId">Participant phone number or ID</Label>
                <Input
                  id="participantId"
                  value={participantId}
                  onChange={(event) => setParticipantId(event.target.value)}
                  placeholder="+919876543210"
                  disabled={uploadMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">Use the same phone number or ID every time for this participant so their Sheet rows update correctly.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="testPdf">Blood report PDF</Label>
                <Input
                  id="testPdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  disabled={uploadMutation.isPending}
                />
                {selectedFile && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="w-4 h-4" />{selectedFile.name} ({Math.ceil(selectedFile.size / 1024)} KB)</p>
                )}
              </div>
              {uploadError && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{uploadError}
                </div>
              )}
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Automatic Drive matching:</strong> name files like <code className="font-mono">+919876543210_report.pdf</code> in Drive. The phone number becomes the participant ID.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploadMutation.isPending}>Cancel</Button>
                <Button onClick={submitTestUpload} disabled={uploadMutation.isPending} className="gap-2">
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploadMutation.isPending ? 'Processing PDF…' : 'Process and save'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
