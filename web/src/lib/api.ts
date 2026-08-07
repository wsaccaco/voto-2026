import type { SessionUser } from './types';

const BASE = '/api';

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		credentials: 'include',
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
		...init
	});
	if (!res.ok) {
		let message = `Error ${res.status}`;
		try {
			const body = await res.json();
			if (body?.error) message = body.error;
		} catch {
			/* respuesta sin JSON */
		}
		throw new ApiError(message, res.status);
	}
	return res.json() as Promise<T>;
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
	patch: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
	del: <T>(path: string) => request<T>(path, { method: 'DELETE' })
};

// ---------------------------------------------------------------------------
// Sesión (Auth.js)
// ---------------------------------------------------------------------------
export async function getSession(): Promise<SessionUser | null> {
	try {
		const { user } = await api.get<{ user: SessionUser | null }>('/me');
		return user;
	} catch {
		return null;
	}
}

/**
 * Envía un POST como formulario HTML y deja que el navegador siga el redirect
 * de forma natural. No usamos fetch() porque Auth.js responde con un 302 hacia
 * accounts.google.com y fetch intentaría seguirlo (cross-origin sin CORS),
 * lo que lanza "TypeError: Failed to fetch".
 */
function postAsForm(action: string, fields: Record<string, string>) {
	const form = document.createElement('form');
	form.method = 'POST';
	form.action = action;
	for (const [name, value] of Object.entries(fields)) {
		const input = document.createElement('input');
		input.type = 'hidden';
		input.name = name;
		input.value = value;
		form.appendChild(input);
	}
	document.body.appendChild(form);
	form.submit();
}

export async function signInWithGoogle(returnTo?: string) {
	const callbackUrl = returnTo ?? window.location.pathname;
	// Auth.js requiere un POST con token CSRF para iniciar el sign-in.
	const { csrfToken } = await api.get<{ csrfToken: string }>('/auth/csrf');
	postAsForm('/api/auth/signin/google', { csrfToken, callbackUrl });
}

export async function signOut() {
	const { csrfToken } = await api.get<{ csrfToken: string }>('/auth/csrf');
	postAsForm('/api/auth/signout', { csrfToken, callbackUrl: '/' });
}
