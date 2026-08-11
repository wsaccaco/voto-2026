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

/**
 * Handler universal de Auth.js para todas las rutas /api/auth/*.
 * Detrás de un proxy TLS (Coolify/Traefik) el servidor recibe la petición en
 * http:// (socket sin cifrar) y Auth.js generaría un redirect_uri http:// que
 * Google rechaza con redirect_uri_mismatch. Se reconstruye el Request con el
 * origin público (PUBLIC_URL) para que todo el flujo OAuth use https:// en
 * producción.
 */
export function authHandler(c: Context): Promise<Response> {
	const { pathname, search } = new URL(c.req.raw.url);
	const request = new Request(`${env.publicUrl}${pathname}${search}`, c.req.raw);
	return Auth(request, authConfig);
}

export interface SessionUser {
	googleId: string;
	email: string;
	name: string | null;
	image: string | null;
	isAdmin: boolean;
}

/** Nombre de la cookie de sesión según el protocolo público (PUBLIC_URL). */
function sessionCookieName(): string {
	return env.publicUrl.startsWith('https:')
		? '__Secure-authjs.session-token'
		: 'authjs.session-token';
}

/**
 * Decodifica el JWT de sesión directamente (estrategia JWT, sin golpe a BD).
 * Devuelve null si no hay sesión válida.
 */
export async function getSessionUser(c: Context): Promise<SessionUser | null> {
	const cookieName = sessionCookieName();
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

/** Detecta la violación del constraint único de email (23505 users_email_unique). */
function isEmailUniqueViolation(err: unknown): boolean {
	const cause = (err as { cause?: { code?: string; constraint_name?: string } }).cause;
	return cause?.code === '23505' && cause?.constraint_name === 'users_email_unique';
}

/**
 * Garantiza que el usuario de sesión exista en nuestra BD y lo devuelve.
 * Se usa al votar / guardar perfil.
 *
 * El upsert principal es por google_id. Si el email ya existe vinculado a otro
 * google_id (p. ej. registro previo de otra versión de la app), se hace merge
 * por email reasignando el google_id a la cuenta actual, conservando el id y
 * sus votos.
 */
export async function getOrCreateDbUser(session: SessionUser) {
	const email = session.email.toLowerCase();
	const values = {
		googleId: session.googleId,
		email,
		name: session.name,
		avatarUrl: session.image,
		isAdmin: session.isAdmin
	};
	try {
		const [user] = await db
			.insert(users)
			.values(values)
			.onConflictDoUpdate({
				target: users.googleId,
				set: {
					email,
					name: session.name,
					avatarUrl: session.image
				}
			})
			.returning();
		return user;
	} catch (err: unknown) {
		if (!isEmailUniqueViolation(err)) throw err;
		const [user] = await db
			.insert(users)
			.values(values)
			.onConflictDoUpdate({
				target: users.email,
				set: {
					googleId: session.googleId,
					name: session.name,
					avatarUrl: session.image
				}
			})
			.returning();
		return user;
	}
}

/** Busca el usuario de BD por email (para flujos donde ya votó antes). */
export async function findDbUserByEmail(email: string) {
	const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
	return user ?? null;
}
