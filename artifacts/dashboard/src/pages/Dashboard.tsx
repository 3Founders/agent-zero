import { useEffect } from 'react';
import { useGetAdminStatus, getGetAdminStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, HardDrive, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function Dashboard() {
  const queryClient = useQueryClient();
  const { data, error, isLoading, isFetching } = useGetAdminStatus({
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
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            className="gap-2 shrink-0 self-start sm:self-auto"
            disabled={isFetching}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
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
                      <TableCell className="capitalize text-sm">{ex.source}</TableCell>
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
    </div>
  );
}
