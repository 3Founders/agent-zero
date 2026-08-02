import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  RefreshCcw, 
  LogOut, 
  Activity, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  HardDrive, 
  MessageCircle,
  Stethoscope
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function Dashboard() {
  const { password, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { data, isLoading, error, refetch, isRefetching } = useDashboardData();
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (!password) {
      setLocation('/');
    }
  }, [password, setLocation]);

  useEffect(() => {
    // Reset countdown on refetch
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => clearInterval(interval);
  }, [data, isRefetching]); // reset when data updates

  if (!password) return null;

  const extractions = data?.extractions || [];
  const poller = data?.poller;
  const retrievedAt = data?.retrievedAt;

  const successes = extractions.filter(e => e.status === 'success');
  const errors = extractions.filter(e => e.status === 'error');

  const handleRefresh = () => {
    setCountdown(30);
    refetch();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-md px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-1.5 rounded-md shadow-sm">
            <Stethoscope className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Extraction Monitor</h1>
            <p className="text-xs text-muted-foreground font-mono">
              {retrievedAt ? `Last Sync: ${format(new Date(retrievedAt), 'HH:mm:ss')}` : 'Syncing...'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-md border border-border/50">
            Auto-refresh in <span className="text-foreground font-bold">{countdown}s</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={isRefetching || isLoading}
            className="gap-2"
            data-testid="button-refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="w-px h-6 bg-border mx-1"></div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-destructive gap-2" data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {error ? (
          <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-destructive" />
              <div>
                <p className="text-lg font-semibold text-destructive">Connection Lost</p>
                <p className="text-sm text-muted-foreground mt-1">{error.message || 'Failed to retrieve monitor data.'}</p>
              </div>
              <Button variant="outline" onClick={handleRefresh}>Retry Connection</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
            <Skeleton className="h-[400px] rounded-xl" />
          </div>
        ) : (
          <>
            {/* Summary KPI Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="shadow-sm border-primary/10">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg text-primary">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Extractions</p>
                    <p className="text-3xl font-bold font-mono tracking-tight">{extractions.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-teal-500/20">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-teal-500/10 rounded-lg text-teal-600 dark:text-teal-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Successful</p>
                    <p className="text-3xl font-bold font-mono tracking-tight text-teal-700 dark:text-teal-300">{successes.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-red-500/20">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-red-500/10 rounded-lg text-red-600 dark:text-red-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Extraction Errors</p>
                    <p className="text-3xl font-bold font-mono tracking-tight text-red-700 dark:text-red-300">{errors.length}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-secondary rounded-lg text-secondary-foreground">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Poller Status</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="relative flex h-3 w-3">
                        {poller?.enabled && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${poller?.enabled ? 'bg-teal-500' : 'bg-muted-foreground'}`}></span>
                      </span>
                      <p className="text-lg font-bold font-mono uppercase tracking-tight">{poller?.enabled ? 'ACTIVE' : 'IDLE'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Extractions Table */}
              <Card className="col-span-1 lg:col-span-2 shadow-sm border-border flex flex-col">
                <CardHeader className="pb-4 border-b bg-muted/20">
                  <CardTitle className="text-lg">Recent Extractions</CardTitle>
                  <CardDescription>Real-time log of lab result processing from WhatsApp and Google Drive.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto max-h-[600px]">
                  {extractions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground space-y-3">
                      <Database className="w-12 h-12 opacity-20" />
                      <p className="text-lg font-medium">No extractions recorded yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/50 sticky top-0">
                        <TableRow>
                          <TableHead className="w-[180px]">Timestamp</TableHead>
                          <TableHead>Participant ID</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...extractions]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((ext, idx) => (
                          <TableRow key={`${ext.messageId}-${idx}`} className="group data-[state=selected]:bg-muted/50">
                            <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(ext.timestamp), 'MMM dd, HH:mm:ss')}
                            </TableCell>
                            <TableCell className="font-medium font-mono text-sm">{ext.participantId}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {ext.source === 'whatsapp' ? (
                                  <MessageCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <HardDrive className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                )}
                                <span className="capitalize text-xs font-semibold">{ext.source}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {ext.status === 'success' ? (
                                <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">Success</Badge>
                              ) : (
                                <Badge variant="error" className="text-[10px] uppercase font-bold tracking-wider">Error</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {ext.status === 'success' ? (
                                <span className="text-xs font-medium text-muted-foreground">{ext.rows.length} rows extracted</span>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger className="cursor-help text-xs font-medium text-destructive max-w-[150px] truncate text-right block ml-auto">
                                    {ext.reason}
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[300px] break-words">
                                    {ext.reason}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Poller Details Card */}
              <Card className="col-span-1 shadow-sm border-border">
                <CardHeader className="pb-4 border-b bg-muted/20">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-primary" />
                    Drive Poller Diagnostics
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {poller ? (
                    <div className="divide-y divide-border">
                      <div className="p-4 flex justify-between items-center hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          Last Run Time
                        </div>
                        <div className="text-sm font-mono font-medium">
                          {poller.lastRunTime ? formatDistanceToNow(new Date(poller.lastRunTime), { addSuffix: true }) : 'Never'}
                        </div>
                      </div>
                      <div className="p-4 flex justify-between items-center hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                          <Database className="w-4 h-4" />
                          Total Processed
                        </div>
                        <div className="text-sm font-mono font-medium">{poller.processedCount}</div>
                      </div>
                      <div className="p-4 flex justify-between items-center hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                          <CheckCircle2 className="w-4 h-4" />
                          Found Last Run
                        </div>
                        <div className="text-sm font-mono font-medium text-foreground">{poller.filesFoundLastRun}</div>
                      </div>
                      <div className="p-4 flex justify-between items-center hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                          <AlertCircle className="w-4 h-4" />
                          Skipped Last Run
                        </div>
                        <div className="text-sm font-mono font-medium">{poller.filesSkippedLastRun}</div>
                      </div>
                      <div className="p-4 flex justify-between items-center hover:bg-muted/30 transition-colors bg-muted/10">
                        <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
                          <RefreshCcw className="w-4 h-4 text-amber-500" />
                          Pending Retries
                        </div>
                        <div className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">{poller.pendingRetryCount}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">
                      Poller data unavailable.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
