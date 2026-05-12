<script lang="ts">
	import {
		HeartPulse,
		Baby,
		Eye,
		Plus,
		MapPin,
		ClipboardList,
		Check,
		CalendarDays
	} from 'lucide-svelte';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { db } from '$lib/db';
	import { buildHealthBatches } from '$lib/health';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import type { ReproductionRecord, Observation } from '$lib/types';
	import type { HealthBatch } from '$lib/health';

	type ActivityItem = {
		id: string;
		date: string;
		type: 'reproduccion' | 'observacion';
		title: string;
		subtitle: string;
		animalName: string;
	};

	let animalMap = $state(new Map<string, string>());
	let animalTagMap = $state(new Map<string, string>());
	let healthBatches = $state<HealthBatch[]>([]);
	let activities = $state<ActivityItem[]>([]);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const [healthRecords, reproRecords, observations, animals] = await Promise.all([
			db.health.where('deleted').equals(0).toArray(),
			db.reproduction.where('deleted').equals(0).toArray(),
			db.observations.where('deleted').equals(0).toArray(),
			db.animals.toArray()
		]);

		animalMap = new Map(animals.map((a) => [a.animal_id, a.nombre || a.arete_id]));
		animalTagMap = new Map(animals.map((a) => [a.animal_id, a.arete_id || '—']));

		healthBatches = buildHealthBatches(healthRecords, animalMap, animalTagMap);

		// Build activity items (repro + observations)
		activities = [
			...reproRecords.map((r) => ({
				id: r.reproduccion_id,
				date: r.fecha_monta,
				type: 'reproduccion' as const,
				title: r.prenez_confirmada === 'Sí' ? 'Preñez confirmada' : 'Monta registrada',
				subtitle: r.fecha_posible_parto ? `Posible parto: ${r.fecha_posible_parto}` : '',
				animalName: animalMap.get(r.vaca_id) ?? r.vaca_id
			})),
			...observations.map((o) => ({
				id: o.observacion_id,
				date: o.fecha,
				type: 'observacion' as const,
				title: 'Observación',
				subtitle: o.notas.slice(0, 80),
				animalName: animalMap.get(o.animal_id) ?? o.animal_id
			}))
		].sort((a, b) => b.date.localeCompare(a.date));
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return format(new Date(dateStr), 'd MMM yyyy', { locale: es });
		} catch {
			return dateStr;
		}
	}

	const iconConfig = {
		reproduccion: { icon: Baby, color: 'text-pink-600 bg-pink-100' },
		observacion: { icon: Eye, color: 'text-purple-600 bg-purple-100' }
	} as const;
</script>

<div class="mx-auto max-w-lg space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold text-gray-800">Actividad</h2>
		<div class="flex flex-wrap gap-2">
			<a
				href="/actividad/recorridos"
				class="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white"
			>
				<MapPin size={14} /> Recorridos
			</a>
			<a
				href="/actividad/calendario-reproductivo"
				class="flex items-center gap-1 rounded-lg bg-pink-700 px-3 py-2 text-xs font-semibold text-white"
			>
				<CalendarDays size={14} /> Repro
			</a>
			<a
				href="/actividad/salud/nuevo"
				class="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
				title="Evento masivo"
			>
				<ClipboardList size={14} /> Salud
			</a>
			<a
				href="/actividad/salud/individual"
				class="flex items-center gap-1 rounded-lg bg-blue-400 px-3 py-2 text-xs font-semibold text-white"
				title="Evento individual"
			>
				<Plus size={14} /> 1 Salud
			</a>
			<a
				href="/actividad/reproduccion/nuevo"
				class="flex items-center gap-1 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white"
			>
				<Plus size={14} /> Repro
			</a>
			<a
				href="/actividad/observacion/nuevo"
				class="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white"
			>
				<Plus size={14} /> Obs
			</a>
		</div>
	</div>

	{#if healthBatches.length > 0}
		<section class="space-y-2">
			{#each healthBatches as batch (batch.date)}
				<Card class="space-y-3">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="rounded-lg bg-blue-100 p-2 text-blue-600">
								<HeartPulse size={18} />
							</div>
							<div>
								<p class="font-semibold text-gray-800">Evento de salud</p>
								<p class="text-xs text-gray-500">
									{batch.animals.length} animal{batch.animals.length !== 1 ? 'es' : ''}
								</p>
							</div>
						</div>
						<span class="shrink-0 text-xs text-gray-400">{formatDate(batch.date)}</span>
					</div>

					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead>
								<tr
									class="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500"
								>
									<th class="px-2 py-2 text-left">Animal</th>
									{#each batch.eventTypes as eventType}
										<th class="px-2 py-2 text-center">{eventType}</th>
									{/each}
									<th class="px-2 py-2 text-left">Notas</th>
								</tr>
							</thead>
							<tbody>
								{#each batch.animals as row (row.animalId)}
									<tr class="border-b border-gray-50 last:border-b-0">
										<td class="px-2 py-2 align-top">
											<p class="font-medium text-gray-800">{row.animalName}</p>
											<p class="text-xs text-gray-400">#{row.animalTag}</p>
										</td>
										{#each batch.eventTypes as eventType}
											<td class="px-2 py-2 text-center align-top">
												{#if row.eventTypes.has(eventType)}
													<span
														class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700"
													>
														<Check size={14} />
													</span>
												{:else}
													<span class="inline-block h-6 w-6 rounded-full bg-gray-100"></span>
												{/if}
											</td>
										{/each}
										<td class="px-2 py-2 align-top text-xs text-gray-600">
											{[...row.notes].join(' · ') || '—'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Card>
			{/each}
		</section>
	{/if}

	{#if activities.length > 0}
		<div class="space-y-2">
			{#each activities as item (item.id)}
				{@const cfg = iconConfig[item.type]}
				<Card class="flex items-start gap-3">
					<div class="mt-0.5 rounded-lg p-2 {cfg.color}">
						{#if item.type === 'reproduccion'}
							<Baby size={18} />
						{:else}
							<Eye size={18} />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between">
							<span class="font-semibold text-gray-800">{item.title}</span>
							<span class="shrink-0 text-xs text-gray-400">{formatDate(item.date)}</span>
						</div>
						<p class="text-sm text-green-700">{item.animalName}</p>
						{#if item.subtitle}
							<p class="truncate text-xs text-gray-500">{item.subtitle}</p>
						{/if}
					</div>
				</Card>
			{/each}
		</div>
	{:else if healthBatches.length === 0}
		<EmptyState
			title="Sin actividad registrada"
			description="Los eventos de salud, reproducción y observaciones aparecerán aquí."
		>
			{#snippet icon()}
				<HeartPulse size={56} />
			{/snippet}
		</EmptyState>
	{/if}
</div>
