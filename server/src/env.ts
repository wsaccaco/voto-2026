export const env = {
	databaseUrl: process.env.DATABASE_URL ?? '',
	authSecret: process.env.AUTH_SECRET ?? '',
	googleClientId: process.env.AUTH_GOOGLE_ID ?? '',
	googleClientSecret: process.env.AUTH_GOOGLE_SECRET ?? '',
	adminEmails: (process.env.ADMIN_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean),
	cronSecret: process.env.CRON_SECRET ?? '',
	port: Number(process.env.PORT ?? 3001),
	publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:5173',
	webDist: process.env.WEB_DIST ?? new URL('../../web/dist', import.meta.url).pathname,
	nodeEnv: process.env.NODE_ENV ?? 'development'
};

export function isAdminEmail(email: string | undefined | null): boolean {
	if (!email) return false;
	return env.adminEmails.includes(email.toLowerCase());
}
