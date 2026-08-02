import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, QueryCache, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useGetSetupStatus, getGetSetupStatusQueryKey } from '@workspace/api-client-react';
import { Loader2 } from 'lucide-react';

import { Dashboard } from './pages/Dashboard';
import { AuthGate } from './components/AuthGate';
import { SetupWizard } from './pages/SetupWizard';

interface SetupGuardProps {
  authHeader: string | null;
  onAuth: (p: string) => void;
  onLogout: () => void;
}

function SetupGuard({ authHeader, onAuth, onLogout }: SetupGuardProps) {
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
        {!authHeader && setupStatus?.adminPassword ? (
          <AuthGate onAuthenticated={onAuth} />
        ) : (
          // Build the Basic auth header here and pass it down so every API call
          // sends `Authorization: Basic <base64>` directly — bypassing the
          // setAuthTokenGetter path which would prepend an extra "Bearer" prefix.
          <Dashboard authHeader={authHeader ?? ''} onLogout={onLogout} />
        )}
      </Route>
    </Switch>
  );
}

export default function App() {
  // Initialise synchronously from localStorage so there's no hydration flicker.
  const [password, setPassword] = useState<string | null>(
    () => localStorage.getItem('adminPassword')
  );

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

  const authHeader = password ? 'Basic ' + btoa(':' + password) : null;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SetupGuard authHeader={authHeader} onAuth={handleAuth} onLogout={clearAuth} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
