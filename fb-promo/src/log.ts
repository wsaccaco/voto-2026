import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Logs a consola + .data/logs/YYYY-MM-DD.log. Las alertas críticas (sesión
// vencida, checkpoint, bloqueo) además se escriben en .data/ALERT.txt para
// poder monitorearlas desde fuera (cron, scripts de aviso, etc.).

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = join(rootDir, '.data');
const logsDir = join(dataDir, 'logs');
export const alertFile = join(dataDir, 'ALERT.txt');

function stamp(): string {
	return new Date().toISOString();
}

function logFile(): string {
	return join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
}

function write(level: string, message: string): void {
	const line = `[${stamp()}] [${level}] ${message}`;
	console.log(line);
	try {
		mkdirSync(logsDir, { recursive: true });
		appendFileSync(logFile(), line + '\n', 'utf8');
	} catch (err) {
		console.error('No se pudo escribir el log:', err);
	}
}

export const log = {
	info: (message: string) => write('INFO', message),
	warn: (message: string) => write('WARN', message),
	error: (message: string) => write('ERROR', message)
};

// Alerta crítica: el daemon debe detenerse y requerir intervención humana.
export function alert(message: string): void {
	log.error(`ALERTA: ${message}`);
	try {
		mkdirSync(dataDir, { recursive: true });
		writeFileSync(alertFile, `[${stamp()}] ${message}\n`, 'utf8');
	} catch (err) {
		console.error('No se pudo escribir la alerta:', err);
	}
	// Bell en terminal para llamar la atención si se corre en foreground.
	process.stdout.write('\u0007');
}
