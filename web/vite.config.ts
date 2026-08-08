import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src')
		}
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				// false: preserva el header Host original del navegador (localhost:5173).
				// Asi Auth.js genera el redirect_uri de Google apuntando a :5173, que es
				// el origen donde el usuario guarda las cookies y termina el login.
				changeOrigin: false
			},
			'/og': {
				// Las imágenes OG se generan en el servidor (endpoint /og/resultados/:id.png).
				target: 'http://localhost:3001'
			}
		}
	}
});
