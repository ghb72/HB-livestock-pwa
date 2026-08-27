<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Plus, Beef, AlertTriangle, ArrowUpDown, GitBranch } from 'lucide-svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Card from '$lib/components/Card.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';
	import { replaceWith } from '$lib/navigation.svelte';
	import { formatTagId } from '$lib/helpers';
	import type { AnimalTipo } from '$lib/types';
	import { DEFAULT_SORT, SORT_LABELS } from './sort';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const animals = $derived(data.animals);
	const photoMap = $derived(data.photoMap);
	const missingInfo = $derived(data.missingInfo);
	const filterTipo = $derived(data.filterTipo);
	const sortBy = $derived(data.sortBy);

	const TIPO_FILTERS: AnimalTipo[] = ['Vaca', 'Semental', 'Becerro(a)', 'Vaquilla', 'Torete'];

	// Filters live in the URL so browser back restores them along with the page.
	// Writes replace the current entry — back should leave the list, not walk
	// through every filter the user tried.
	function setParam(key: string, value: string) {
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set(key, value);
		else params.delete(key);
		const query = params.toString();
		void replaceWith(query ? `/ganado?${query}` : '/ganado', {
			noScroll: true,
			keepFocus: true
		});
	}

	// The input stays local so typing feels instant; the URL catches up after a pause.
	let searchInput = $state(untrack(() => data.search));
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function onSearch(value: string) {
		searchInput = value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => setParam('q', value), 300);
	}

	// Keep the box in sync when the URL itself changes (back/forward), without
	// clobbering what the user is mid-way through typing.
	let lastSearchFromUrl = untrack(() => data.search);
	$effect(() => {
		if (data.search !== lastSearchFromUrl) {
			lastSearchFromUrl = data.search;
			searchInput = data.search;
		}
	});

	onMount(() => {
		const handler = () => invalidateAll();
		window.addEventListener('sync-complete', handler);
		return () => {
			clearTimeout(searchTimer);
			window.removeEventListener('sync-complete', handler);
		};
	});
</script>

<div class="mx-auto max-w-lg space-y-4 p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold text-gray-800">Ganado</h2>
		<div class="flex items-center gap-2">
			<a
				href="/ganado/grafica"
				class="flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-gray-800"
			>
				<GitBranch size={18} />
				Vista gráfica
			</a>
			<a
				href="/ganado/nuevo"
				class="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-700"
			>
				<Plus size={18} />
				Agregar
			</a>
		</div>
	</div>

	<SearchBar value={searchInput} onchange={onSearch} />

	<div class="flex items-center gap-2">
		<ArrowUpDown size={14} class="shrink-0 text-gray-400" />
		<select
			value={sortBy}
			onchange={(e) => setParam('sort', e.currentTarget.value === DEFAULT_SORT ? '' : e.currentTarget.value)}
			class="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-green-500"
		>
			{#each Object.entries(SORT_LABELS) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>
	</div>

	<div class="flex gap-2 overflow-x-auto pb-1">
		<button
			onclick={() => setParam('tipo', '')}
			class="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {filterTipo === ''
				? 'bg-green-600 text-white'
				: 'bg-gray-200 text-gray-700'}"
		>
			Todos
		</button>
		{#each TIPO_FILTERS as tipo}
			<button
				onclick={() => setParam('tipo', tipo === filterTipo ? '' : tipo)}
				class="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {filterTipo ===
				tipo
					? 'bg-green-600 text-white'
					: 'bg-gray-200 text-gray-700'}"
			>
				{tipo}
			</button>
		{/each}
	</div>

	{#if animals.length > 0}
		<div class="space-y-2">
			{#each animals as animal (animal.animal_id)}
				{@const isMissing = missingInfo.missingIds.has(animal.animal_id)}
				{@const photoSrc = photoMap.get(animal.animal_id)}
				<Card onclick={() => goto(`/ganado/${animal.animal_id}`)}>
					<div class="flex items-center gap-3">
						{#if photoSrc}
							<ZoomablePhoto
								src={photoSrc}
								alt={animal.nombre}
								imgClass="h-12 w-12 shrink-0 rounded-full object-cover ring-2 {isMissing
									? 'ring-amber-400'
									: 'ring-green-200'}"
							/>
						{:else}
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold {isMissing
									? 'bg-amber-100 text-amber-700'
									: 'bg-green-100 text-green-700'}"
							>
								{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
							</div>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="truncate font-semibold text-gray-800">
									{animal.nombre || 'Sin nombre'}
								</span>
								<StatusBadge estado={animal.estado} />
								{#if isMissing}
									<AlertTriangle size={16} class="shrink-0 text-amber-500" />
								{/if}
							</div>
							<div class="flex gap-3 text-xs text-gray-500">
								<span>{formatTagId(animal.arete_id) || '—'}</span>
								<span>{animal.tipo}</span>
								<span>{animal.sexo}</span>
								{#if animal.raza}
									<span>{animal.raza}</span>
								{/if}
							</div>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{:else}
		<EmptyState
			title="Sin animales registrados"
			description="Agrega tu primer animal para comenzar."
		>
			{#snippet icon()}
				<Beef size={56} />
			{/snippet}
			{#snippet action()}
				<a
					href="/ganado/nuevo"
					class="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow-sm"
				>
					Registrar animal
				</a>
			{/snippet}
		</EmptyState>
	{/if}
</div>
