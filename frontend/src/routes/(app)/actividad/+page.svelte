<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { formatStoredDate } from '$lib/date';
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
		animalId: string;
		animalName: string;
	};

	let animalMap = $state(new Map<string, string>());
	let animalTagMap = $state(new Map<string, string>());
	let photoMap = $state(new Map<string, string>());
	let healthBatches = $state<HealthBatch[]>([]);
	let activities = $state<ActivityItem[]>([]);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const [healthRecords, reproRecords, observations, animals, photos] = await Promise.all([
			db.health.where('deleted').equals(0).toArray(),
			db.reproduction.where('deleted').equals(0).toArray(),
			db.observations.where('deleted').equals(0).toArray(),
			db.animals.toArray(),
			db.photos.toArray()
		]);

		animalMap = new Map(animals.map((a) => [a.animal_id, a.nombre || a.arete_id]));
		animalTagMap = new Map(animals.map((a) => [a.animal_id, a.arete_id || '—']));

		const nextPhotoMap = new Map<string, string>();
		for (const animal of animals) {
			if (animal.foto_url) {
				nextPhotoMap.set(animal.animal_id, animal.foto_url);
			}
		}
		for (const photo of photos) {
			if (photo.deleted === 0) {
				nextPhotoMap.set(photo.animal_id, photo.data_url || photo.drive_url);
			}
		}
		photoMap = nextPhotoMap;

		healthBatches = buildHealthBatches(healthRecords, animalMap, animalTagMap);

		// Build activity items (repro + observations)
		activities = [
			...reproRecords.map((r) => ({
				id: r.reproduccion_id,
				date: r.fecha_monta,
				type: 'reproduccion' as const,
				title: r.prenez_confirmada === 'Sí' ? 'Preñez confirmada' : 'Monta registrada',
				subtitle: r.fecha_posible_parto ? `Posible parto: ${r.fecha_posible_parto}` : '',
				animalId: r.vaca_id,
				animalName: animalMap.get(r.vaca_id) ?? r.vaca_id
			})),
			...observations.map((o) => ({
				id: o.observacion_id,
				date: o.fecha,
				type: 'observacion' as const,
				title: 'Observación',
				subtitle: o.notas.slice(0, 80),
				animalId: o.animal_id,
				animalName: animalMap.get(o.animal_id) ?? o.animal_id
			}))
		].sort((a, b) => b.date.localeCompare(a.date));
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return formatStoredDate(dateStr, 'd MMM yyyy', es);
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
	<section class="space-y-4 rounded-2xl bg-gradient-to-br from-white via-gray-50 to-pink-50 p-4 shadow-sm ring-1 ring-gray-100">
		<div class="space-y-1">
			<h2 class="text-2xl font-bold tracking-tight text-gray-800">Actividad</h2>
			<p class="text-sm text-gray-500">Consulta vistas clave y registra nuevos eventos.</p>
		</div>

		<div class="space-y-2">
			<h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Vistas</h3>
			<div class="flex flex-wrap gap-2">
			<a
				href="/actividad/recorridos"
				class="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-800"
			>
				<MapPin size={16} /> Mostrar Recorridos
			</a>
			<a
				href="/actividad/calendario-reproductivo"
				class="flex items-center gap-1.5 rounded-xl bg-pink-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-pink-800"
			>
				<CalendarDays size={16} /> Inteligencia Reproductiva
			</a>
			</div>
		</div>

		<div class="space-y-2 border-t border-gray-200 pt-3">
			<h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
				Nuevos eventos
			</h3>
			<div class="flex flex-wrap gap-2">
				<a
					href="/actividad/salud/nuevo"
					class="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-blue-700"
					title="Evento masivo"
				>
					<ClipboardList size={16} /> Salud grupal
				</a>
				<a
					href="/actividad/salud/individual"
					class="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-sky-600"
					title="Evento individual"
				>
					<Plus size={16} /> Salud
				</a>
				<a
					href="/actividad/reproduccion/nuevo"
					class="flex items-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-pink-700"
				>
					<Plus size={16} /> Reproducción
				</a>
				<a
					href="/actividad/observacion/nuevo"
					class="flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-purple-700"
				>
					<Plus size={16} /> Observación
				</a>
			</div>
		</div>
	</section>

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
				{@const photoSrc = item.type === 'reproduccion' ? photoMap.get(item.animalId) : undefined}
				<Card
					class="flex items-start gap-3"
					onclick={item.type === 'reproduccion'
						? () => goto(`/actividad/reproduccion/${item.id}`)
						: undefined}
				>
					{#if item.type === 'reproduccion' && photoSrc}
						<img
							src={photoSrc}
							alt={item.animalName}
							class="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-pink-200"
						/>
					{:else if item.type === 'reproduccion'}
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pink-100 text-lg font-bold text-pink-700"
						>
							{item.animalName?.charAt(0)?.toUpperCase() ?? '?'}
						</div>
					{:else}
						<div class="mt-0.5 rounded-lg p-2 {cfg.color}">
							<Eye size={18} />
						</div>
					{/if}
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
