import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const appShellRevision = process.env.VERCEL_GIT_COMMIT_SHA ?? new Date().toISOString();

export default defineConfig({
	server: {
		host: '0.0.0.0',
		allowedHosts: true,
		proxy: {
			'/api': {
				target: 'http://localhost:8000',
				changeOrigin: true
			},
			'/health': {
				target: 'http://localhost:8000',
				changeOrigin: true
			}
		}
	},
	preview: {
		host: '0.0.0.0',
		allowedHosts: true
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			injectRegister: false,
			registerType: 'autoUpdate',
			manifest: {
				name: 'Ganado La Escondida',
				short_name: 'Ganado',
				description: 'Registro ganadero offline-first para manejo de hato',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#F0FDF4',
				theme_color: '#15803D',
				orientation: 'portrait-primary',
				categories: ['productivity'],
				icons: [
					{
						src: 'icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: 'icon.svg',
						sizes: 'any',
						type: 'image/svg+xml',
						purpose: 'any'
					}
				]
			},
			workbox: {
				additionalManifestEntries: [{ url: '/', revision: appShellRevision }],
				globPatterns: ['client/**/*.{js,css,html,svg,ico,woff,woff2,png}'],
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.destination === 'image',
						handler: 'CacheFirst',
						options: {
							cacheName: 'image-cache',
							cacheableResponse: { statuses: [0, 200] },
							expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }
						}
					},
					{
						urlPattern: /^https?:\/\/.*\/api\//,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: { maxEntries: 50, maxAgeSeconds: 300 }
						}
					}
				]
			}
		})
	]
});
