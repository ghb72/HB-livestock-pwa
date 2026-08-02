<script lang="ts">
	import { Settings } from 'lucide-svelte';
	import SyncStatus from './SyncStatus.svelte';

	interface Props {
		title?: string;
	}

	let { title = 'Registro Ganadero' }: Props = $props();
</script>

<header
	class="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-green-700 px-4 py-3 text-white shadow-sm"
>
	<h1 class="text-lg font-bold tracking-tight">{title}</h1>
	<div class="flex items-center gap-2">
		<SyncStatus />
		<a
			href="/ajustes"
			class="rounded-full p-2 transition-colors hover:bg-green-600"
			aria-label="Ajustes"
		>
			<Settings size={22} />
		</a>
	</div>
</header>
