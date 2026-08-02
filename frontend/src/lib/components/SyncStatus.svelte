<script lang="ts">
	import { liveQuery } from 'dexie';
	import { Check, CloudOff, CloudUpload, RefreshCw } from 'lucide-svelte';
	import { countPendingChanges, getIsSyncing, syncAll, type SyncStatus } from '$lib/sync';

	let status = $state<SyncStatus>(getIsSyncing() ? 'syncing' : 'synced');
	let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
	let pending = $state(0);

	$effect(() => {
		const onStatus = (event: Event) => {
			status = (event as CustomEvent<SyncStatus>).detail;
		};
		const goOnline = () => (online = true);
		const goOffline = () => (online = false);

		window.addEventListener('sync-status', onStatus);
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('sync-status', onStatus);
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	});

	// Creating a record does not emit any event, so the count has to come from a
	// live IndexedDB query — otherwise the chip would stay stale right after the
	// user saves something, which is exactly when the count matters most.
	$effect(() => {
		const subscription = liveQuery(() => countPendingChanges()).subscribe({
			next: (count) => (pending = count),
			error: () => {}
		});
		return () => subscription.unsubscribe();
	});

	let busy = $derived(status === 'syncing');
	let label = $derived(
		!online ? 'Sin conexión' : busy ? 'Sincronizando…' : pending > 0 ? `${pending} pend.` : 'Sincronizado'
	);
	let tone = $derived(
		!online
			? 'bg-gray-500 text-gray-200'
			: pending > 0 && !busy
				? 'bg-amber-500 text-white'
				: 'bg-green-600 text-white'
	);

	async function handleSync() {
		if (busy || !online) return;
		try {
			await syncAll(true);
		} catch {
			// Sync errors surface through the status event
		}
	}
</script>

<button
	onclick={handleSync}
	disabled={!online || busy}
	class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {tone}"
	title={online ? `${label} — toca para sincronizar ahora` : 'Sin conexión'}
	aria-label={online ? `${label}. Toca para sincronizar ahora` : 'Sin conexión'}
>
	{#if !online}
		<CloudOff size={16} />
	{:else if busy}
		<RefreshCw size={16} class="animate-spin" />
	{:else if pending > 0}
		<CloudUpload size={16} />
		<!-- The count stays visible on phones; only the wordy label collapses. -->
		<span class="sm:hidden">{pending}</span>
	{:else}
		<Check size={16} />
	{/if}
	<span class="hidden sm:inline">{label}</span>
</button>
