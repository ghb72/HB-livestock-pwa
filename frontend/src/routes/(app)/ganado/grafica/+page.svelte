<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, GitBranch, X } from 'lucide-svelte';
	import { SvelteFlow, Background } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { db } from '$lib/db';
	import { getAllPhotos } from '$lib/store';
	import { createGenealogySource, buildFlowLayout } from '$lib/genealogy';
	import { formatTagId } from '$lib/helpers';
	import type { Animal, AnimalPhoto, EstadoAnimal, ReproductionRecord } from '$lib/types';
	import GenealogyFlowNode from './GenealogyFlowNode.svelte';

	const nodeTypes = { genealogy: GenealogyFlowNode };

	let loading = $state(true);
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
				getAllPhotos(),
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

	<!-- Panel: nodo foco -->
	<div class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-semibold text-gray-800">Nodo foco</p>
				<p class="truncate text-xs text-gray-500">
					{#if selectedAnimal}
						{selectedAnimal.nombre}{selectedAnimal.arete_id
							? ` · ${formatTagId(selectedAnimal.arete_id)}`
							: ''}
					{:else}
						Toca una tarjeta del grafo para centrar la familia en esa res.
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
					minZoom={0.6}
					maxZoom={1.8}
					panOnDrag={true}
					zoomOnScroll={true}
					zoomOnPinch={true}
					zoomOnDoubleClick={false}
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
	{/if}
</div>
