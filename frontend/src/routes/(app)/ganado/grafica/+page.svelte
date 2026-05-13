<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, GitBranch, X } from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { db } from '$lib/db';
	import {
		createGenealogySource,
		buildGenealogyGraph,
		type GenealogyEdge,
		type GenealogyNode
	} from '$lib/genealogy';
	import type { Animal, AnimalPhoto, EstadoAnimal, ReproductionRecord } from '$lib/types';

	const NODE_WIDTH = 188;
	const NODE_HEIGHT = 132;
	const COLUMN_GAP = 28;
	const ROW_GAP = 88;
	const GRAPH_PADDING = 24;

	type GraphLayoutNode = GenealogyNode & { x: number; y: number; centerX: number; centerY: number };
	type GraphLayoutEdge = GenealogyEdge & {
		fromX: number;
		fromY: number;
		toX: number;
		toY: number;
	};

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

	const graph = $derived(
		selectedAnimalId ? buildGenealogyGraph(source, selectedAnimalId, maxDepth) : null
	);

	const graphLayout = $derived.by(() => {
		if (!graph) return null;

		const grouped = new Map<number, GenealogyNode[]>();
		for (const node of graph.nodes) {
			const row = grouped.get(node.generation) ?? [];
			row.push(node);
			grouped.set(node.generation, row);
		}

		const generations = Array.from(grouped.keys()).sort((a, b) => a - b);
		const rows = generations.map((generation) => ({
			generation,
			nodes: (grouped.get(generation) ?? []).sort((a, b) =>
				a.isFocus === b.isFocus ? a.nombre.localeCompare(b.nombre, 'es') : a.isFocus ? 1 : -1
			)
		}));

		const maxColumns = Math.max(...rows.map((row) => row.nodes.length), 1);
		const width = GRAPH_PADDING * 2 + maxColumns * NODE_WIDTH + (maxColumns - 1) * COLUMN_GAP;
		const height =
			GRAPH_PADDING * 2 + rows.length * NODE_HEIGHT + Math.max(rows.length - 1, 0) * ROW_GAP;

		const nodes = new Map<string, GraphLayoutNode>();

		for (const [rowIndex, row] of rows.entries()) {
			const rowWidth = row.nodes.length * NODE_WIDTH + Math.max(row.nodes.length - 1, 0) * COLUMN_GAP;
			const baseX = GRAPH_PADDING + Math.max((width - GRAPH_PADDING * 2 - rowWidth) / 2, 0);
			const y = GRAPH_PADDING + rowIndex * (NODE_HEIGHT + ROW_GAP);

			row.nodes.forEach((node, columnIndex) => {
				const x = baseX + columnIndex * (NODE_WIDTH + COLUMN_GAP);
				nodes.set(node.id, {
					...node,
					x,
					y,
					centerX: x + NODE_WIDTH / 2,
					centerY: y + NODE_HEIGHT / 2
				});
			});
		}

		const edges: GraphLayoutEdge[] = graph.edges
			.map((edge) => {
				const from = nodes.get(edge.from);
				const to = nodes.get(edge.to);
				if (!from || !to) return null;

				const fromX = from.centerX;
				const fromY = from.y + NODE_HEIGHT;
				const toX = to.centerX;
				const toY = to.y;

				return {
					...edge,
					fromX,
					fromY,
					toX,
					toY
				};
			})
			.filter((edge): edge is GraphLayoutEdge => edge !== null);

		return {
			width,
			height,
			nodes,
			edges
		};
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

	const STATE_FILTERS: Array<EstadoAnimal | ''> = ['', 'Vivo(a)', 'Muerto(a)', 'Vendido(a)'];
	const DEPTH_OPTIONS = [1, 2, 3, 4];

	function edgeClasses(relation: GenealogyEdge['relation']) {
		return relation === 'madre-hijo'
			? 'stroke-pink-400'
			: 'stroke-pink-500 stroke-dasharray-[7_6]';
	}

	function stateRing(estado: EstadoAnimal, isFocus: boolean) {
		if (isFocus) return 'ring-pink-500';
		if (estado === 'Vivo(a)') return 'ring-green-300';
		if (estado === 'Muerto(a)') return 'ring-red-300';
		return 'ring-amber-300';
	}

	function nodeSurface(estado: EstadoAnimal, isFocus: boolean) {
		if (isFocus) return 'border-pink-300 bg-gradient-to-br from-pink-50 via-white to-rose-50 shadow-md';
		if (estado === 'Vivo(a)') return 'border-gray-200 bg-white';
		if (estado === 'Muerto(a)') return 'border-red-200 bg-red-50/40';
		return 'border-amber-200 bg-amber-50/40';
	}
</script>

<div class="mx-auto max-w-lg space-y-4 p-4">
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => goto('/ganado')}
				class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
				aria-label="Volver"
			>
				<ArrowLeft size={22} />
			</button>
			<div>
				<h2 class="text-xl font-bold text-gray-800">Vista gráfica</h2>
				<p class="text-xs text-gray-500">Ancestros y descendientes con foco progresivo.</p>
			</div>
		</div>
		<div class="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
			{source.animals.length} reses
		</div>
	</div>

	<SearchBar value={search} onchange={(value) => (search = value)} />

	<div class="flex flex-wrap gap-2">
		{#each STATE_FILTERS as filter}
			<button
				type="button"
				onclick={() => (stateFilter = filter)}
				class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {stateFilter === filter
					? 'bg-green-600 text-white'
					: 'bg-gray-200 text-gray-700'}"
			>
				{filter || 'Todos los estados'}
			</button>
		{/each}
	</div>

	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-sm font-semibold text-gray-800">Nodo foco</p>
				<p class="text-xs text-gray-500">
					{#if selectedAnimal}
						{selectedAnimal.nombre} {selectedAnimal.arete_id ? `· #${selectedAnimal.arete_id}` : ''}
					{:else}
						Selecciona una res para comenzar a explorar el grafo.
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
							: 'bg-gray-100 text-gray-600'}"
					>
						{depth} gen.
					</button>
				{/each}
				{#if selectedAnimal}
					<button
						type="button"
						onclick={clearFocus}
						class="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600"
					>
						<X size={14} /> Limpiar
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if loading}
		<div class="py-16 text-center text-sm text-gray-400">Cargando relaciones...</div>
	{:else}
		{#if !selectedAnimal}
			<EmptyState
				title="Selecciona una res"
				description="Empieza desde una res para mantener la vista ligera y expandible."
			>
				{#snippet icon()}
					<GitBranch size={56} />
				{/snippet}
			</EmptyState>

			{#if filteredAnimals.length > 0}
				<div class="space-y-2">
					<p class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
						Resultados
					</p>
					{#each filteredAnimals.slice(0, 12) as animal (animal.animal_id)}
						<Card onclick={() => focusAnimal(animal.animal_id)}>
							<div class="flex items-center gap-3">
								{#if animal.photoSrc}
									<img
										src={animal.photoSrc}
										alt={animal.nombre}
										class="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-gray-200"
									/>
								{:else}
									<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600">
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
				</div>
			{/if}
		{:else if graphLayout}
			<div class="space-y-3">
				<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
					<div class="flex flex-wrap items-center gap-3 text-xs text-gray-500">
						<div class="flex items-center gap-2">
							<span class="inline-flex h-0.5 w-8 rounded-full bg-pink-400"></span>
							Madre
						</div>
						<div class="flex items-center gap-2">
							<span class="inline-flex h-0.5 w-8 rounded-full border-t-2 border-dashed border-pink-500"></span>
							Padre
						</div>
					</div>
				</div>

				<div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
					<div
						class="relative"
						style={`width: ${graphLayout.width}px; height: ${graphLayout.height}px;`}
					>
						<svg class="absolute inset-0" width={graphLayout.width} height={graphLayout.height}>
							<defs>
								<marker
									id="genealogy-arrow"
									viewBox="0 0 10 10"
									refX="8"
									refY="5"
									markerWidth="7"
									markerHeight="7"
									orient="auto-start-reverse"
								>
									<path d="M 0 0 L 10 5 L 0 10 z" fill="#f472b6" />
								</marker>
							</defs>
							{#each graphLayout.edges as edge (edge.id)}
								<line
									x1={edge.fromX}
									y1={edge.fromY}
									x2={edge.toX}
									y2={edge.toY}
									class={`${edgeClasses(edge.relation)} stroke-[2.5]`}
									marker-end="url(#genealogy-arrow)"
								/>
							{/each}
						</svg>

						{#each Array.from(graphLayout.nodes.values()) as node (node.id)}
							<div
								class="absolute"
								style={`left: ${node.x}px; top: ${node.y}px; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px;`}
							>
								<div class="flex h-full flex-col rounded-2xl border p-3 ring-2 {stateRing(node.estado, node.isFocus)} {nodeSurface(node.estado, node.isFocus)}">
									<div class="flex min-h-0 items-start gap-3">
										{#if node.photoSrc}
											<img
												src={node.photoSrc}
												alt={node.nombre}
												class="h-12 w-12 shrink-0 rounded-full object-cover"
											/>
										{:else}
											<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-600">
												{node.nombre?.charAt(0)?.toUpperCase() ?? '?'}
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-center gap-2">
												<p class="truncate text-sm font-semibold text-gray-800">{node.nombre}</p>
												<StatusBadge estado={node.estado} />
											</div>
											<p class="truncate text-xs text-gray-500">
												#{node.areteId || '—'} · {node.tipo}
											</p>
											<div class="mt-2 flex items-center justify-between gap-2">
												<span class="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold {node.isFocus ? 'bg-pink-100 text-pink-700' : node.generation < 0 ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-700'}">
													{node.isFocus ? 'Foco' : node.generation < 0 ? 'Ancestro' : 'Descendencia'}
												</span>
												<span class="text-[11px] font-medium text-gray-400">
													G{Math.abs(node.generation)}
												</span>
											</div>
										</div>
									</div>
									<div class="mt-auto flex items-center justify-between gap-2 pt-3">
										<button
											type="button"
											onclick={() => focusAnimal(node.id)}
											class="flex-1 rounded-full bg-gray-100 px-3 py-1.5 text-center text-xs font-semibold text-gray-700"
										>
											Centrar
										</button>
										<button
											type="button"
											onclick={() => goto(`/ganado/${node.id}`)}
											class="flex-1 rounded-full bg-green-50 px-3 py-1.5 text-center text-xs font-semibold text-green-700"
										>
											Ficha
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>