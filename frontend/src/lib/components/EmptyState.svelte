<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		icon: Snippet;
		title: string;
		description: string;
		action?: Snippet;
	}

	let { icon, title, description, action }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center px-6 py-16 text-center">
	<div class="mb-4 text-gray-300">
		{@render icon()}
	</div>
	<h3 class="mb-1 text-lg font-semibold text-gray-700">{title}</h3>
	<p class="mb-6 text-sm text-gray-500">{description}</p>
	{#if action}
		{@render action()}
	{/if}
</div>
