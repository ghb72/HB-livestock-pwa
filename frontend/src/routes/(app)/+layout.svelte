<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { initSync } from '$lib/sync';
	import { initHistoryTracking } from '$lib/navigation.svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
	let cleanupSync: (() => void) | undefined;

	// Must run during component init, not in onMount.
	initHistoryTracking();

	onMount(() => {
		cleanupSync = initSync();
	});

	onDestroy(() => {
		cleanupSync?.();
	});
</script>

<div class="flex min-h-screen flex-col bg-gray-50">
	<Header />
	<main class="flex-1 pb-[calc(4rem+var(--sab))]">
		{@render children()}
	</main>
	<BottomNav />
</div>
