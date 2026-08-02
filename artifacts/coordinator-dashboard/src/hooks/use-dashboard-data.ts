import { getAdminExtractions } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';

export function useDashboardData() {
  const { password, logout } = useAuth();

  const query = useQuery({
    queryKey: ['/api/admin/extractions', password],
    queryFn: async () => {
      try {
        return await getAdminExtractions({
          headers: { Authorization: 'Basic ' + btoa(':' + password) }
        });
      } catch (err: any) {
        if (err.status === 401) {
          logout();
        }
        throw err;
      }
    },
    enabled: !!password,
    refetchInterval: 30_000, // 30 seconds
    retry: (failureCount, error: any) => {
      if (error?.status === 401) return false;
      return failureCount < 3;
    },
  });

  return query;
}
