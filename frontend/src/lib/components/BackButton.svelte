<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import { goBack } from '$lib/navigation.svelte';

	interface Props {
		/** Where to go when this page is the first entry of the session. */
		fallback: string;
		size?: number;
		class?: string;
	}

	let {
		fallback,
		size = 24,
		class: className = 'rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200'
	}: Props = $props();
</script>

<button type="button" onclick={() => goBack(fallback)} class={className} aria-label="Volver">
	<ArrowLeft {size} />
</button>
