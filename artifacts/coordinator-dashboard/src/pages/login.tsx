import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { Stethoscope } from 'lucide-react';

export default function Login() {
  const [inputPwd, setInputPwd] = useState('');
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPwd.trim()) {
      login(inputPwd.trim());
      setLocation('/dashboard');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/20">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
            <Stethoscope className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Trial Coordinator</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Enter the administrative password to access the monitoring dashboard.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={inputPwd}
                onChange={(e) => setInputPwd(e.target.value)}
                className="font-mono text-center tracking-widest bg-muted/50 border-muted-foreground/20 focus-visible:ring-primary"
                data-testid="input-password"
              />
            </div>
            <Button type="submit" className="w-full font-semibold shadow-sm" data-testid="button-login">
              Authenticate
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
