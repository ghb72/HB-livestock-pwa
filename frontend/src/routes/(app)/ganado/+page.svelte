<script lang="ts">
	import { goto } from '$app/navigation';
	import { Plus, Beef, AlertTriangle, ArrowUpDown } from 'lucide-svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import Card from '$lib/components/Card.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { db } from '$lib/db';
	import { computeMissingAnimals, type MissingAnimalInfo } from '$lib/missingAnimals';
	import type { Animal, AnimalTipo } from '$lib/types';

	type SortOption = 'nombre_asc' | 'nombre_desc' | 'reciente' | 'antiguo' | 'edad_desc' | 'edad_asc';

	const SORT_LABELS: Record<SortOption, string> = {
		nombre_asc: 'Nombre A→Z',
		nombre_desc: 'Nombre Z→A',
		reciente: 'Más nuevo',
		antiguo: 'Más antiguo',
		edad_desc: 'Mayor edad',
		edad_asc: 'Menor edad'
	};

	const TIPO_FILTERS: AnimalTipo[] = ['Vaca', 'Semental', 'Becerro(a)', 'Vaquilla', 'Torete'];

	let search = $state('');
	let filterTipo = $state('');
	let sortBy = $state<SortOption>('reciente');

	let animals = $state<Animal[]>([]);
	let photoMap = $state(new Map<string, string>());
	let missingInfo = $state<MissingAnimalInfo>({ missingIds: new Set(), lastSeenMap: new Map() });

	async function loadData() {
		const [allAnimals, allPhotos, missing] = await Promise.all([
			db.animals.where('deleted').equals(0).toArray(),
			db.photos.toArray(),
			computeMissingAnimals()
		]);

		const pMap = new Map<string, string>();
		for (const animal of allAnimals) {
			if (animal.foto_url) {
				pMap.set(animal.animal_id, animal.foto_url);
			}
		}
		for (const p of allPhotos) {
			if (p.deleted === 0) pMap.set(p.animal_id, p.data_url || p.drive_url);
		}
		photoMap = pMap;
		missingInfo = missing;

		const normalizedSearch = search.toLowerCase();
		const aliveAnimals = allAnimals.filter((a) => a.estado === 'Vivo(a)');
		const filtered = aliveAnimals.filter((a) => {
			const nombre = String(a.nombre ?? '').toLowerCase();
			const areteId = String(a.arete_id ?? '').toLowerCase();
			const matchSearch = !normalizedSearch || nombre.includes(normalizedSearch) || areteId.includes(normalizedSearch);
			const matchTipo = !filterTipo || a.tipo === filterTipo;
			return matchSearch && matchTipo;
		});

		filtered.sort((a, b) => {
			switch (sortBy) {
				case 'nombre_asc': return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
				case 'nombre_desc': return String(b.nombre ?? '').localeCompare(String(a.nombre ?? ''), 'es');
				case 'reciente': return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
				case 'antiguo': return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
				case 'edad_desc': return String(a.fecha_nacimiento ?? '').localeCompare(String(b.fecha_nacimiento ?? ''));
				case 'edad_asc': return String(b.fecha_nacimiento ?? '').localeCompare(String(a.fecha_nacimiento ?? ''));
				default: return 0;
			}
		});

		animals = filtered;
	}

	$effect(() => {
		// Re-run when search, filter, or sort changes
		void search;
		void filterTipo;
		void sortBy;
		loadData();
		const handler = () => loadData();
		window.addEventListener('sync-complete', handler);
		return () => window.removeEventListener('sync-complete', handler);
	});
</script>

<div class="mx-auto max-w-lg space-y-4 p-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold text-gray-800">Ganado</h2>
		<a
			href="/ganado/nuevo"
			class="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-700"
		>
			<Plus size={18} />
			Agregar
		</a>
	</div>

	<SearchBar value={search} onchange={(v) => (search = v)} />

	<div class="flex items-center gap-2">
		<ArrowUpDown size={14} class="shrink-0 text-gray-400" />
		<select
			value={sortBy}
			onchange={(e) => (sortBy = e.currentTarget.value as SortOption)}
			class="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-green-500"
		>
			{#each Object.entries(SORT_LABELS) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>
	</div>

	<div class="flex gap-2 overflow-x-auto pb-1">
		<button
			onclick={() => (filterTipo = '')}
			class="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors {filterTipo === ''
				? 'bg-green-600 text-white'
				: 'bg-gray-200 text-gray-700'}"
		>
			Todos
		</button>
		{#each TIPO_FILTERS as tipo}
			<button
				onclick={() => (filterTipo = tipo === filterTipo ? '' : tipo)}
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
							<img
								src={photoSrc}
								alt={animal.nombre}
								class="h-12 w-12 shrink-0 rounded-full object-cover ring-2 {isMissing
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
								<span>#{animal.arete_id || '—'}</span>
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
