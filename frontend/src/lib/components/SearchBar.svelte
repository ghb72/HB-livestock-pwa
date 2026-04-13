<script lang="ts">
	import { Search, X } from 'lucide-svelte';

	interface Props {
		value: string;
		onchange: (value: string) => void;
		placeholder?: string;
	}

	let { value, onchange, placeholder = 'Buscar por nombre o arete...' }: Props = $props();
</script>

<div class="relative">
	<Search
		size={20}
		class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
	/>
	<input
		type="search"
		{value}
		oninput={(e) => onchange(e.currentTarget.value)}
		{placeholder}
		class="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-10 text-base placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
	/>
	{#if value}
		<button
			onclick={() => onchange('')}
			class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:text-gray-600"
			aria-label="Limpiar búsqueda"
		>
			<X size={18} />
		</button>
	{/if}
</div>
