import { Auth, type AuthConfig } from '@auth/core';
import Google from '@auth/core/providers/google';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { decode } from '@auth/core/jwt';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { env, isAdminEmail } from './env.js';
import { eq } from 'drizzle-orm';

export const authConfig: AuthConfig = {
	secret: env.authSecret,
	trustHost: true,
	basePath: '/api/auth',
	session: { strategy: 'jwt' },
	providers: [
		Google({
			clientId: env.googleClientId,
			clientSecret: env.googleClientSecret
		})
	],
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.googleId = user.id;
				token.email = user.email;
				token.name = user.name;
				token.picture = user.image ?? token.picture;
			}
			return token;
		},
		session({ session, token }) {
			if (session.user) {
				session.user.email = token.email ?? session.user.email;
				session.user.name = token.name ?? session.user.name;
				session.user.image = (token.picture as string) ?? session.user.image;
			}
			return session;
		}
	}
};

/** Handler universal de Auth.js para todas las rutas /api/auth/* */
export function authHandler(c: Context): Promise<Response> {
	return Auth(c.req.raw, authConfig);
}

export interface SessionUser {
	googleId: string;
	email: string;
	name: string | null;
	image: string | null;
	isAdmin: boolean;
}

/** Nombre de la cookie de sesión según el protocolo. */
function sessionCookieName(req: Request): string {
	return new URL(req.url).protocol === 'https:'
		? '__Secure-authjs.session-token'
		: 'authjs.session-token';
}

/**
 * Decodifica el JWT de sesión directamente (estrategia JWT, sin golpe a BD).
 * Devuelve null si no hay sesión válida.
 */
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
	const cookieName = sessionCookieName(c.req.raw);
	const token = getCookie(c, cookieName);
	if (!token) return null;
	try {
		const payload = await decode({ token, secret: env.authSecret, salt: cookieName });
		if (!payload?.email || !payload.sub) return null;
		return {
			googleId: payload.sub,
			email: payload.email,
			name: (payload.name as string) ?? null,
			image: (payload.picture as string) ?? null,
			isAdmin: isAdminEmail(payload.email)
		};
	} catch {
		return null;
	}
}

/**
 * Garantiza que el usuario de sesión exista en nuestra BD y lo devuelve.
 * Se usa al votar / guardar perfil.
 */
export async function getOrCreateDbUser(session: SessionUser) {
	const [user] = await db
		.insert(users)
		.values({
			googleId: session.googleId,
			email: session.email.toLowerCase(),
			name: session.name,
			avatarUrl: session.image,
			isAdmin: session.isAdmin
		})
		.onConflictDoUpdate({
			target: users.googleId,
			set: {
				email: session.email.toLowerCase(),
				name: session.name,
				avatarUrl: session.image
			}
		})
		.returning();
	return user;
}

/** Busca el usuario de BD por email (para flujos donde ya votó antes). */
export async function findDbUserByEmail(email: string) {
	const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
	return user ?? null;
}
