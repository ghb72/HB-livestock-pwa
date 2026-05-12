<script lang="ts">
	import { ArrowLeft, Calendar, ChevronRight, Edit, MapPin, Plus, Trash2 } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { db } from '$lib/db';
	import { getRecorridoRelativeLabel } from '$lib/recorridos';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { deleteRecorrido } from '$lib/store';

	type RecorridoGroup = {
		id: string;
		fecha: string;
		count: number;
	};

	let recorridoList = $state<RecorridoGroup[]>([]);
	let totalAlive = $state(0);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const [all, aliveCount] = await Promise.all([
			db.recorridos.where('deleted').equals(0).toArray(),
			db.animals.where('estado').equals('Vivo(a)').count()
		]);

		totalAlive = aliveCount;

		const grouped = new Map<string, RecorridoGroup>();
		for (const entry of all) {
			const existing = grouped.get(entry.recorrido_id);
			if (existing) {
				existing.count += 1;
			} else {
				grouped.set(entry.recorrido_id, {
					id: entry.recorrido_id,
					fecha: entry.fecha,
					count: 1
				});
			}
		}

		recorridoList = Array.from(grouped.values()).sort((a, b) =>
			b.fecha.localeCompare(a.fecha)
		);
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return format(new Date(dateStr), "EEEE d 'de' MMMM, yyyy", { locale: es });
		} catch {
			return dateStr;
		}
	}

	async function handleDelete(recorridoId: string) {
		if (!confirm('¿Estás seguro de eliminar este recorrido?')) return;
		await deleteRecorrido(recorridoId);
		await loadData();
	}
</script>

<div class="mx-auto max-w-lg space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<button
				type="button"
				onclick={() => history.back()}
				class="rounded-lg p-1 text-gray-600 active:bg-gray-100"
				aria-label="Volver"
			>
				<ArrowLeft size={22} />
			</button>
			<div>
				<h2 class="text-xl font-bold text-gray-800">Recorridos</h2>
				<p class="text-xs text-gray-500">Historial de visitas al potrero</p>
			</div>
		</div>
		<a
			href="/actividad/recorrido/nuevo"
			class="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-700"
		>
			<Plus size={18} />
			Nuevo
		</a>
	</div>

	{#if recorridoList.length > 0}
		<div class="space-y-2">
			{#each recorridoList as rec (rec.id)}
				{@const percentage = totalAlive > 0 ? Math.round((rec.count / totalAlive) * 100) : 0}
				{@const relativeLabel = getRecorridoRelativeLabel(rec.fecha)}
				<Card class="overflow-hidden p-0">
					<div class="flex items-stretch">
						<button
							type="button"
							onclick={() => goto(`/actividad/recorrido/${rec.id}`)}
							class="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
						>
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100"
							>
								<Calendar size={20} class="text-green-700" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-semibold capitalize text-gray-800">
									{formatDate(rec.fecha)}
								</p>
								<div class="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
									<span>{rec.count} de {totalAlive} animales</span>
									{#if relativeLabel}
										<span class="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700">
											{relativeLabel}
										</span>
									{/if}
									<span
										class="font-semibold {percentage >= 80
											? 'text-green-600'
											: percentage >= 50
												? 'text-amber-600'
												: 'text-red-500'}"
									>
										{percentage}%
									</span>
								</div>
								<div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
									<div
										class="h-full rounded-full transition-all {percentage >= 80
											? 'bg-green-500'
											: percentage >= 50
												? 'bg-amber-500'
												: 'bg-red-400'}"
										style="width: {percentage}%"
									></div>
								</div>
							</div>
							<ChevronRight size={18} class="text-gray-400" />
						</button>
						<div class="flex shrink-0 flex-col justify-center gap-2 border-l border-gray-100 p-3">
							<a
								href="/actividad/recorrido/{rec.id}/editar"
								class="rounded-full bg-green-100 p-2.5 text-green-700 transition-colors hover:bg-green-200"
								aria-label="Editar recorrido"
							>
								<Edit size={16} />
							</a>
							<button
								type="button"
								onclick={() => handleDelete(rec.id)}
								class="rounded-full bg-red-100 p-2.5 text-red-700 transition-colors hover:bg-red-200"
								aria-label="Eliminar recorrido"
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{:else}
		<EmptyState
			title="Sin recorridos"
			description="Inicia tu primer recorrido de campo para registrar los animales que observes."
		>
			{#snippet icon()}
				<MapPin size={56} />
			{/snippet}
			{#snippet action()}
				<a
					href="/actividad/recorrido/nuevo"
					class="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow-sm"
				>
					Iniciar recorrido
				</a>
			{/snippet}
		</EmptyState>
	{/if}
</div>
