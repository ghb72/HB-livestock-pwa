<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import PhotoLightboxHost from '$lib/components/PhotoLightboxHost.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

{@render children()}
<PhotoLightboxHost />
