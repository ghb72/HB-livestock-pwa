<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
		onclick?: () => void;
	}

	let { children, class: className = '', onclick }: Props = $props();

	const base = 'rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow';
</script>

{#if onclick}
	<button
		type="button"
		{onclick}
		class="{base} w-full cursor-pointer text-left active:shadow-md {className}"
	>
		{@render children()}
	</button>
{:else}
	<div class="{base} {className}">
		{@render children()}
	</div>
{/if}
