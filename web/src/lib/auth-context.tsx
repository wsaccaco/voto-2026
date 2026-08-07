import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSession } from '@/lib/api';
import type { SessionUser } from '@/lib/types';

interface AuthContextValue {
	user: SessionUser | null;
	loading: boolean;
	refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
	user: null,
	loading: true,
	refresh: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<SessionUser | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		const session = await getSession();
		setUser(session);
		setLoading(false);
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	return useContext(AuthContext);
}
