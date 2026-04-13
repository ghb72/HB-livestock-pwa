<script lang="ts">
	import { Calendar, ChevronRight, MapPin, Plus } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { db } from '$lib/db';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

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
</script>

<div class="mx-auto max-w-lg space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-bold text-gray-800">Recorridos</h2>
			<p class="text-xs text-gray-500">Historial de visitas al potrero</p>
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
				<Card
					class="flex items-center gap-3"
					onclick={() => goto(`/actividad/recorrido/${rec.id}`)}
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
