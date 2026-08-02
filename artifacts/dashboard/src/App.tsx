import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { setAuthTokenGetter, useGetSetupStatus, getGetSetupStatusQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';

import { Dashboard } from './pages/Dashboard';
import { AuthGate } from './components/AuthGate';
import { SetupWizard } from './pages/SetupWizard';
import NotFound from '@/pages/not-found';

function SetupGuard({ password, handleAuth }: { password: string | null, handleAuth: (p: string) => void }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { data: setupStatus, isLoading } = useGetSetupStatus();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If setup isn't complete, force showing wizard regardless of route
  if (setupStatus && !setupStatus.allRequired) {
    return (
      <SetupWizard 
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: getGetSetupStatusQueryKey() });
          setLocation('/');
        }} 
      />
    );
  }

  return (
    <Switch>
      <Route path="/setup">
        <SetupWizard 
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: getGetSetupStatusQueryKey() });
            setLocation('/');
          }} 
        />
      </Route>
      <Route path="/">
        {!password && setupStatus?.adminPassword ? (
          <AuthGate onAuthenticated={handleAuth} />
        ) : (
          <Dashboard />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [password, setPassword] = useState<string | null>(
    () => localStorage.getItem('adminPassword')
  );

  useEffect(() => {
    if (password) {
      setAuthTokenGetter(() => "Basic " + btoa("admin:" + password));
    } else {
      setAuthTokenGetter(null);
    }
  }, [password]);

  const handleAuth = (pwd: string) => {
    localStorage.setItem('adminPassword', pwd);
    setPassword(pwd);
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem('adminPassword');
    setPassword(null);
  }, []);

  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error: any) => {
        if (error?.status === 401) {
          clearAuth();
        }
      }
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error: any) => {
          if (error?.status === 401) return false;
          return failureCount < 3;
        }
      }
    }
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SetupGuard password={password} handleAuth={handleAuth} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
