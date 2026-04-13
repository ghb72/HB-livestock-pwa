<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Check, Eye, EyeOff, X } from 'lucide-svelte';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { db } from '$lib/db';
	import Card from '$lib/components/Card.svelte';
	import type { Animal } from '$lib/types';

	type ObservedItem = {
		animal: Animal;
		note: string;
	};

	const id = page.params.id;

	let loading = $state(true);
	let fecha = $state('');
	let recorridoId = $state('');
	let observed = $state<ObservedItem[]>([]);
	let notObserved = $state<Animal[]>([]);
	let total = $state(0);

	let percentage = $derived(total > 0 ? Math.round((observed.length / total) * 100) : 0);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const entries = await db.recorridos.where('recorrido_id').equals(id).toArray();
		if (entries.length === 0) {
			loading = false;
			return;
		}

		const allAlive = await db.animals.where('estado').equals('Vivo(a)').toArray();
		const seenIds = new Set(entries.map((e) => e.animal_id));
		const animalsMap = new Map(allAlive.map((a) => [a.animal_id, a]));

		fecha = entries[0].fecha;
		recorridoId = id;
		total = allAlive.length;

		observed = entries
			.map((e) => ({ animal: animalsMap.get(e.animal_id)!, note: e.notas }))
			.filter((e) => e.animal != null);

		notObserved = allAlive.filter((a) => !seenIds.has(a.animal_id));
		loading = false;
	}

	function formatDate(dateStr: string): string {
		try {
			return format(new Date(dateStr), "EEEE d 'de' MMMM, yyyy", { locale: es });
		} catch {
			return dateStr;
		}
	}
</script>

{#if loading}
	<div class="py-12 text-center text-gray-400">Cargando...</div>
{:else}
	<div class="mx-auto max-w-lg space-y-4">
		<div class="flex items-center gap-3">
			<button
				onclick={() => history.back()}
				class="rounded-lg p-1 text-gray-600 active:bg-gray-100"
			>
				<ArrowLeft size={22} />
			</button>
			<div>
				<h2 class="text-lg font-bold text-gray-800">Recorrido {recorridoId}</h2>
				<p class="text-sm capitalize text-gray-500">{formatDate(fecha)}</p>
			</div>
		</div>

		<!-- Summary -->
		<div class="rounded-xl bg-white p-4 shadow-sm">
			<div class="flex items-center justify-between">
				<span class="text-sm text-gray-600">Animales observados</span>
				<span class="text-xl font-bold text-green-600">
					{observed.length}<span class="text-sm text-gray-400">/{total}</span>
					<span class="ml-2 text-sm font-normal text-gray-400">({percentage}%)</span>
				</span>
			</div>
			<div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
				<div class="h-full rounded-full bg-green-500" style="width: {percentage}%"></div>
			</div>
		</div>

		<!-- Observed -->
		<section>
			<div class="mb-2 flex items-center gap-2">
				<Eye size={18} class="text-green-600" />
				<span class="text-sm font-semibold text-gray-700">
					Observados ({observed.length})
				</span>
			</div>
			<div class="space-y-1.5">
				{#each observed as { animal, note } (animal.animal_id)}
					<Card class="flex items-center gap-3">
						<div
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600"
						>
							<Check size={16} strokeWidth={3} />
						</div>
						<div class="min-w-0 flex-1">
							<span class="font-medium text-gray-800">
								{animal.nombre || 'Sin nombre'}
							</span>
							<span class="ml-2 text-xs text-gray-400">
								#{animal.arete_id || '—'}
							</span>
							{#if note}
								<p class="text-xs text-gray-500">{note}</p>
							{/if}
						</div>
					</Card>
				{/each}
			</div>
		</section>

		<!-- Not observed -->
		{#if notObserved.length > 0}
			<section>
				<div class="mb-2 flex items-center gap-2">
					<EyeOff size={18} class="text-red-500" />
					<span class="text-sm font-semibold text-gray-700">
						No observados ({notObserved.length})
					</span>
				</div>
				<div class="space-y-1.5">
					{#each notObserved as animal (animal.animal_id)}
						<Card class="flex items-center gap-3 opacity-60">
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-400"
							>
								<X size={16} strokeWidth={3} />
							</div>
							<div class="min-w-0 flex-1">
								<span class="font-medium text-gray-700">
									{animal.nombre || 'Sin nombre'}
								</span>
								<span class="ml-2 text-xs text-gray-400">
									#{animal.arete_id || '—'}
								</span>
							</div>
						</Card>
					{/each}
				</div>
			</section>
		{/if}
	</div>
{/if}
