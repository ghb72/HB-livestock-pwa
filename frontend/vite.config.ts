import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'HB Registro Ganadero',
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
				globPatterns: ['client/**/*.{js,css,html,svg,ico,woff,woff2,png}'],
				runtimeCaching: [
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
