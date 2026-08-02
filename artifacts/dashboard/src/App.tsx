import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { setAuthTokenGetter } from '@workspace/api-client-react';

import { Dashboard } from './pages/Dashboard';
import { AuthGate } from './components/AuthGate';
import NotFound from '@/pages/not-found';

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
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

  if (!password) {
    return <AuthGate onAuthenticated={handleAuth} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
