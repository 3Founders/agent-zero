import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthContextValue {
  password: string | null;
  login: (pwd: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Reads localStorage synchronously via the lazy useState initializer.
 * This means `password` is never null mid-hydration — it's either the
 * stored value or null right from the first render, with no async effect needed.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [password, setPassword] = useState<string | null>(() =>
    localStorage.getItem('admin_password'),
  );

  const login = useCallback((pwd: string) => {
    localStorage.setItem('admin_password', pwd);
    setPassword(pwd);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('admin_password');
    setPassword(null);
  }, []);

  return (
    <AuthContext.Provider value={{ password, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
