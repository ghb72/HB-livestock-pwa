<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import { syncAll } from '$lib/sync';

	let syncing = $state(false);
	let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);

	$effect(() => {
		const goOnline = () => (online = true);
		const goOffline = () => (online = false);
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});

	async function handleSync() {
		if (syncing || !online) return;
		syncing = true;
		try {
			await syncAll(true);
		} catch {
			// Sync errors handled silently
		} finally {
			syncing = false;
		}
	}
</script>

<button
	onclick={handleSync}
	disabled={!online || syncing}
	class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {online
		? 'bg-green-600 text-white hover:bg-green-500'
		: 'bg-gray-500 text-gray-200'}"
	title={online ? 'Sincronizar datos' : 'Sin conexión'}
>
	<RefreshCw size={16} class={syncing ? 'animate-spin' : ''} />
	<span class="hidden sm:inline">
		{syncing ? 'Sincronizando...' : online ? 'Sincronizar' : 'Offline'}
	</span>
</button>
