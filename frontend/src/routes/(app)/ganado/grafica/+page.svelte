<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, GitBranch, X } from 'lucide-svelte';
	import { SvelteFlow, Background } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { db } from '$lib/db';
	import { createGenealogySource, buildFlowLayout } from '$lib/genealogy';
	import type { Animal, AnimalPhoto, EstadoAnimal, ReproductionRecord } from '$lib/types';
	import GenealogyFlowNode from './GenealogyFlowNode.svelte';

	const nodeTypes = { genealogy: GenealogyFlowNode };

	let loading = $state(true);
	let search = $state('');
	let stateFilter = $state<EstadoAnimal | ''>('');
	let maxDepth = $state(3);
	let animals = $state<Animal[]>([]);
	let photos = $state<AnimalPhoto[]>([]);
	let reproduction = $state<ReproductionRecord[]>([]);

	const selectedAnimalId = $derived(page.url.searchParams.get('animal') ?? '');

	$effect(() => {
		loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const [allAnimals, allPhotos, allReproduction] = await Promise.all([
				db.animals.where('deleted').equals(0).toArray(),
				db.photos.toArray(),
				db.reproduction.where('deleted').equals(0).toArray()
			]);
			animals = allAnimals;
			photos = allPhotos;
			reproduction = allReproduction;
		} finally {
			loading = false;
		}
	}

	const source = $derived(createGenealogySource(animals, photos, reproduction));

	const filteredAnimals = $derived.by(() => {
		const normalizedSearch = search.trim().toLowerCase();
		return source.animals.filter((animal) => {
			const matchesSearch =
				!normalizedSearch ||
				animal.nombre.toLowerCase().includes(normalizedSearch) ||
				animal.arete_id.toLowerCase().includes(normalizedSearch) ||
				animal.animal_id.toLowerCase().includes(normalizedSearch);
			const matchesState = !stateFilter || animal.estado === stateFilter;
			return matchesSearch && matchesState;
		});
	});

	const selectedAnimal = $derived(
		selectedAnimalId ? source.animalsById.get(selectedAnimalId) : undefined
	);

	function focusAnimal(animalId: string) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('animal', animalId);
		goto(`/ganado/grafica?${params.toString()}`);
	}

	function clearFocus() {
		const params = new URLSearchParams(page.url.searchParams);
		params.delete('animal');
		const query = params.toString();
		goto(query ? `/ganado/grafica?${query}` : '/ganado/grafica');
	}

	const flowLayout = $derived(
		buildFlowLayout(source, selectedAnimalId || null, maxDepth, {
			onCenter: focusAnimal,
			onFicha: (id) => goto(`/ganado/${id}`)
		})
	);

	const flowKey = $derived(`${selectedAnimalId}-${maxDepth}`);

	const STATE_FILTERS: Array<EstadoAnimal | ''> = ['', 'Vivo(a)', 'Muerto(a)', 'Vendido(a)'];
	const DEPTH_OPTIONS = [1, 2, 3, 4];
</script>

<div class="mx-auto max-w-lg space-y-4 p-4">
	<!-- Encabezado -->
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => goto('/ganado')}
				class="rounded-full p-2 text-gray-600 hover:bg-gray-100"
				aria-label="Volver"
			>
				<ArrowLeft size={22} />
			</button>
			<div>
				<h2 class="text-xl font-bold text-gray-800">Árbol genealógico</h2>
				<p class="text-xs text-gray-500">Linea genética de tus reses.</p>
			</div>
		</div>
		<div class="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
			{source.animals.length} reses
		</div>
	</div>

	<!-- Búsqueda + filtros de estado -->
	<SearchBar value={search} onchange={(value) => (search = value)} />

	<div class="flex flex-wrap gap-2">
		{#each STATE_FILTERS as filter}
			<button
				type="button"
				onclick={() => (stateFilter = filter)}
				class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {stateFilter === filter
					? 'bg-green-600 text-white'
					: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			>
				{filter || 'Todos'}
			</button>
		{/each}
	</div>

	<!-- Panel: nodo foco -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-semibold text-gray-800">Nodo foco</p>
				<p class="truncate text-xs text-gray-500">
					{#if selectedAnimal}
						{selectedAnimal.nombre}{selectedAnimal.arete_id
							? ` · #${selectedAnimal.arete_id}`
							: ''}
					{:else}
						Selecciona una res de la lista para centrar el grafo.
					{/if}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#each DEPTH_OPTIONS as depth}
					<button
						type="button"
						onclick={() => (maxDepth = depth)}
						class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {maxDepth === depth
							? 'bg-gray-900 text-white'
							: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
						title="{depth} generaciones"
					>
						{depth} gen.
					</button>
				{/each}
				{#if selectedAnimal}
					<button
						type="button"
						onclick={clearFocus}
						class="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
					>
						<X size={14} />
						Limpiar
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if loading}
		<div class="py-20 text-center text-sm text-gray-400">Cargando relaciones...</div>
	{:else if source.animals.length === 0}
		<EmptyState
			title="Sin animales registrados"
			description="Añade reses al sistema para ver su genealogía."
		>
			{#snippet icon()}
				<GitBranch size={56} />
			{/snippet}
		</EmptyState>
	{:else}
		<!-- Leyenda de relaciones -->
		<div class="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm">
			<div class="flex items-center gap-2">
				<span class="inline-block h-0.5 w-8 rounded-full bg-pink-400"></span>
				Madre
			</div>
			<div class="flex items-center gap-2">
				<span class="inline-block h-0 w-8 border-t-2 border-dashed border-pink-400"></span>
				Padre
			</div>
			<div class="flex items-center gap-2">
				<span class="inline-block h-3 w-3 rounded-full border-2 border-green-400"></span>
				Vivo(a)
			</div>
			<div class="flex items-center gap-2">
				<span class="inline-block h-3 w-3 rounded-full border-2 border-red-400"></span>
				Muerto(a)
			</div>
			<div class="flex items-center gap-2">
				<span class="inline-block h-3 w-3 rounded-full border-2 border-amber-400"></span>
				Vendido(a)
			</div>
		</div>

		<!-- Grafo genealógico -->
		{#key flowKey}
			<div
				class="overflow-hidden rounded-2xl border border-gray-200 shadow-sm"
				style="height: 65vh; min-height: 420px;"
			>
				<SvelteFlow
					nodes={flowLayout.nodes}
					edges={flowLayout.edges}
					{nodeTypes}
					fitView
					fitViewOptions={{ padding: 0.2 }}
					panOnDrag={false}
					zoomOnScroll={false}
					zoomOnPinch={false}
					preventScrolling={false}
					nodesDraggable={false}
					nodesConnectable={false}
					elementsSelectable={false}
					colorMode="light"
				>
					<Background bgColor="#f9fafb" patternColor="#e5e7eb" gap={24} />
				</SvelteFlow>
			</div>
		{/key}

		<!-- Lista de selección (solo cuando no hay foco) -->
		{#if !selectedAnimal}
			<div class="space-y-2 pt-2">
				<p class="text-xs font-semibold uppercase tracking-widest text-gray-400">
					Selecciona una res para centrar
				</p>
				{#if filteredAnimals.length > 0}
					{#each filteredAnimals.slice(0, 12) as animal (animal.animal_id)}
						<Card onclick={() => focusAnimal(animal.animal_id)}>
							<div class="flex items-center gap-3">
								{#if animal.photoSrc}
									<img
										src={animal.photoSrc}
										alt={animal.nombre}
										class="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-gray-100"
									/>
								{:else}
									<div
										class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500"
									>
										{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<p class="truncate font-semibold text-gray-800">{animal.nombre}</p>
										<StatusBadge estado={animal.estado} />
									</div>
									<p class="text-xs text-gray-500">
										#{animal.arete_id || '—'} · {animal.tipo}
									</p>
								</div>
							</div>
						</Card>
					{/each}
				{:else}
					<p class="py-4 text-center text-sm text-gray-400">
						No se encontraron reses con ese filtro.
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
