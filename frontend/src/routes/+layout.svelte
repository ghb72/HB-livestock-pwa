<script lang="ts">
	import '../app.css';
	import PhotoLightboxHost from '$lib/components/PhotoLightboxHost.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

{@render children()}
<PhotoLightboxHost />
