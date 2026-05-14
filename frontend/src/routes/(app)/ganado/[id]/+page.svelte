<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		Edit,
		Trash2,
		GitBranch,
		HeartPulse,
		Baby,
		Eye,
		DollarSign,
		AlertTriangle
	} from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { db } from '$lib/db';
	import { formatStoredDate } from '$lib/date';
	import { formatTagId } from '$lib/helpers';
	import {
		getAnimal,
		getHealthRecords,
		getObservations,
		getPhotos,
		deleteAnimal
	} from '$lib/store';
	import { computeMissingAnimals } from '$lib/missingAnimals';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import type {
		Animal,
		HealthRecord,
		ReproductionRecord,
		Observation,
		Sale
	} from '$lib/types';

	const animalId = $derived(page.params.id);

	let animal = $state<Animal | undefined>();
	let healthRecords = $state<HealthRecord[]>([]);
	let reproRecords = $state<ReproductionRecord[]>([]);
	let observations = $state<Observation[]>([]);
	let sales = $state<Sale[]>([]);
	let motherName = $state('');
	let fatherName = $state('');
	let photoSrc = $state('');
	let isMissing = $state(false);
	let lastSeen = $state<string | undefined>();
	let offspring = $state<
		{ animal_id: string; nombre: string; arete_id: string; photoSrc: string }[]
	>([]);

	$effect(() => {
		if (animalId) loadAll(animalId);
	});

	const matingDates = $derived.by(() =>
		Array.from(new Set(reproRecords.map((record) => record.fecha_monta).filter(Boolean))).sort((a, b) =>
			b.localeCompare(a)
		)
	);

	const inferredBirthDates = $derived.by(() =>
		Array.from(
			new Set(reproRecords.map((record) => record.fecha_posible_parto).filter(Boolean))
		).sort((a, b) => b.localeCompare(a))
	);

	const actualBirthDates = $derived.by(() =>
		Array.from(new Set(reproRecords.map((record) => record.fecha_parto_real).filter(Boolean))).sort(
			(a, b) => b.localeCompare(a)
		)
	);

	async function loadAll(id: string) {
		const [a, health, obs, saleList, photos, missing] = await Promise.all([
			getAnimal(id),
			getHealthRecords(id),
			getObservations(id),
			db.sales
				.where('animal_id')
				.equals(id)
				.filter((r) => r.deleted === 0)
				.toArray(),
			getPhotos(id),
			computeMissingAnimals()
		]);

		animal = a;
		if (!a) return;

		healthRecords = health.sort((x, y) => y.fecha.localeCompare(x.fecha));
		observations = obs.sort((x, y) => y.fecha.localeCompare(x.fecha));
		sales = saleList;

		// Reproduction records (vaca OR semental)
		const allRepro = await db.reproduction
			.where('deleted')
			.equals(0)
			.filter((r) => r.vaca_id === id || r.semental_id === id)
			.toArray();
		reproRecords = allRepro.sort((x, y) => y.fecha_monta.localeCompare(x.fecha_monta));

		// Photo
		photoSrc = photos.length > 0 ? photos[0].data_url || photos[0].drive_url : a.foto_url;

		// Parents
		if (a.madre_id) {
			const m = await db.animals.get(a.madre_id);
			motherName = m ? `${m.nombre} (${formatTagId(m.arete_id) || '—'})` : a.madre_id;
		} else {
			motherName = '—';
		}
		if (a.padre_id) {
			const f = await db.animals.get(a.padre_id);
			fatherName = f ? `${f.nombre} (${formatTagId(f.arete_id) || '—'})` : a.padre_id;
		} else {
			fatherName = '—';
		}

		// Offspring
		const [calvesByMother, calvesByFather, allPhotos] = await Promise.all([
			db.animals
				.where('madre_id')
				.equals(id)
				.filter((r) => r.deleted === 0)
				.toArray(),
			db.animals
				.where('padre_id')
				.equals(id)
				.filter((r) => r.deleted === 0)
				.toArray(),
			db.photos.toArray()
		]);
		const byId = new Map<string, { animal_id: string; nombre: string; arete_id: string; photoSrc: string }>();
		const photoMap = new Map<string, string>();
		for (const photo of allPhotos) {
			if (photo.deleted === 0) {
				photoMap.set(photo.animal_id, photo.data_url || photo.drive_url);
			}
		}
		for (const calf of [...calvesByMother, ...calvesByFather]) {
			byId.set(calf.animal_id, {
				animal_id: calf.animal_id,
				nombre: calf.nombre || 'Sin nombre',
				arete_id: String(calf.arete_id ?? ''),
				photoSrc: photoMap.get(calf.animal_id) || calf.foto_url || ''
			});
		}
		for (const birth of allRepro) {
			const calfId = String(birth.cria_id ?? '').trim();
			if (!calfId || byId.has(calfId)) continue;
			const calf = await db.animals.get(calfId);
			if (calf) {
				byId.set(calf.animal_id, {
					animal_id: calf.animal_id,
					nombre: calf.nombre || 'Sin nombre',
					arete_id: String(calf.arete_id ?? ''),
					photoSrc: photoMap.get(calf.animal_id) || calf.foto_url || ''
				});
			} else {
				byId.set(calfId, {
					animal_id: calfId,
					nombre: calfId,
					arete_id: '',
					photoSrc: photoMap.get(calfId) || ''
				});
			}
		}
		offspring = Array.from(byId.values());

		// Missing
		isMissing = missing.missingIds.has(id);
		lastSeen = missing.lastSeenMap.get(id);
	}

	function fmtDate(dateStr: string): string {
		if (!dateStr) return '—';
		try {
			return formatStoredDate(dateStr, 'd MMM yyyy', es);
		} catch {
			return dateStr;
		}
	}

	async function handleDelete() {
		if (!animal || !confirm('¿Estás seguro de eliminar este animal?')) return;
		await deleteAnimal(animal.animal_id);
		goto('/ganado', { replaceState: true });
	}
</script>

{#if !animal}
	<div class="flex h-64 items-center justify-center text-gray-500">Cargando...</div>
{:else}
	<div class="mx-auto max-w-lg space-y-4">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<button
					onclick={() => goto('/ganado')}
					class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
					aria-label="Volver"
				>
					<ArrowLeft size={24} />
				</button>
				<div>
					<h2 class="text-xl font-bold text-gray-800">
						{animal.nombre || 'Sin nombre'}
					</h2>
					<p class="text-sm text-gray-500">{animal.tipo}</p>
				</div>
			</div>
			<div class="flex gap-2">
				<a
					href="/ganado/grafica?animal={animal.animal_id}"
					class="rounded-full bg-gray-100 p-2.5 text-gray-700 hover:bg-gray-200"
					aria-label="Vista gráfica"
				>
					<GitBranch size={18} />
				</a>
				<a
					href="/ganado/{animal.animal_id}/editar"
					class="rounded-full bg-green-100 p-2.5 text-green-700 hover:bg-green-200"
					aria-label="Editar"
				>
					<Edit size={18} />
				</a>
				<button
					onclick={handleDelete}
					class="rounded-full bg-red-100 p-2.5 text-red-700 hover:bg-red-200"
					aria-label="Eliminar"
				>
					<Trash2 size={18} />
				</button>
			</div>
		</div>

		<!-- Missing warning -->
		{#if isMissing}
			<div class="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
				<AlertTriangle size={20} class="mt-0.5 shrink-0 text-amber-600" />
				<div>
					<p class="text-sm font-semibold text-amber-800">Animal no visto recientemente</p>
					<p class="text-xs text-amber-600">
						{lastSeen
							? `Último avistamiento: ${fmtDate(lastSeen)}`
							: 'Nunca ha sido registrado en un recorrido'}
					</p>
				</div>
			</div>
		{/if}

		<!-- Photo -->
		{#if photoSrc}
			<div class="overflow-hidden rounded-xl">
				<ZoomablePhoto
					src={photoSrc}
					alt={animal.nombre}
					triggerClass="block w-full"
					imgClass="h-52 w-full object-cover"
				/>
			</div>
		{/if}

		<!-- Status + basic info -->
		<Card>
			<div class="flex items-center gap-4">
				{#if !photoSrc}
					<div
						class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-green-100 text-2xl font-bold text-green-700"
					>
						{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
					</div>
				{/if}
				<div class="space-y-1">
					<StatusBadge estado={animal.estado} />
					<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
						<span>ID: <strong>{formatTagId(animal.arete_id) || '—'}</strong></span>
						<span>Sexo: <strong>{animal.sexo}</strong></span>
						<span>Raza: <strong>{animal.raza || '—'}</strong></span>
						<span>Temperamento: <strong>{animal.temperamento}</strong></span>
						{#if animal.peso_actual}
							<span>Peso: <strong>{animal.peso_actual} kg</strong></span>
						{/if}
					</div>
				</div>
			</div>
		</Card>

		<!-- Details grid -->
		<Card>
			<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
				Información
			</h3>
			<div class="grid grid-cols-2 gap-3 text-sm">
				<div>
					<span class="text-xs text-gray-400">Nacimiento</span>
					<p class="font-medium text-gray-700">{fmtDate(animal.fecha_nacimiento)}</p>
				</div>
				<div>
					<span class="text-xs text-gray-400">Madre</span>
					<p class="font-medium text-gray-700">{motherName}</p>
				</div>
				<div>
					<span class="text-xs text-gray-400">Padre</span>
					<p class="font-medium text-gray-700">{fatherName}</p>
				</div>
				<div>
					<span class="text-xs text-gray-400">Registrado</span>
					<p class="font-medium text-gray-700">{fmtDate(animal.created_at)}</p>
				</div>
			</div>

			{#if animal.tipo === 'Vaca'}
				<div class="mt-4 rounded-lg bg-gray-50 p-3">
					<p class="text-xs text-gray-400">Crías registradas</p>
					<p class="text-sm font-semibold text-gray-700">{offspring.length}</p>
					{#if offspring.length > 0}
						<ul class="mt-2 space-y-1 text-xs text-gray-600">
							{#each offspring.slice(0, 4) as calf (calf.animal_id)}
								<li class="truncate">
									{calf.nombre}{calf.arete_id ? ` (${formatTagId(calf.arete_id)})` : ''}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if animal.notas}
				<p class="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{animal.notas}</p>
			{/if}
		</Card>

		<!-- Quick links -->
		<div class="grid grid-cols-2 gap-3">
			<a
				href="/actividad/salud/nuevo?animal={animalId}"
				class="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-3 text-sm font-medium text-blue-700 transition-colors active:opacity-80"
			>
				<HeartPulse size={18} />
				<span class="flex-1">Evento de salud</span>
				{#if healthRecords.length > 0}
					<span class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
						{healthRecords.length}
					</span>
				{/if}
			</a>
			<a
				href="/actividad/reproduccion/nuevo?animal={animalId}"
				class="flex items-center gap-2 rounded-xl bg-pink-50 px-3 py-3 text-sm font-medium text-pink-700 transition-colors active:opacity-80"
			>
				<Baby size={18} />
				<span class="flex-1">Reproducción</span>
				{#if reproRecords.length > 0}
					<span class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
						{reproRecords.length}
					</span>
				{/if}
			</a>
			<a
				href="/actividad/observacion/nuevo?animal={animalId}"
				class="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-3 text-sm font-medium text-purple-700 transition-colors active:opacity-80"
			>
				<Eye size={18} />
				<span class="flex-1">Observación</span>
				{#if observations.length > 0}
					<span class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
						{observations.length}
					</span>
				{/if}
			</a>
			<a
				href="/ventas/nuevo?animal={animalId}"
				class="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-3 text-sm font-medium text-amber-700 transition-colors active:opacity-80"
			>
				<DollarSign size={18} />
				<span class="flex-1">Venta</span>
				{#if sales.length > 0}
					<span class="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
						{sales.length}
					</span>
				{/if}
			</a>
		</div>

		<!-- Recent health events -->
		{#if healthRecords.length > 0}
			<Card>
				<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
					Últimos eventos de salud
				</h3>
				<div class="space-y-2">
					{#each healthRecords.slice(0, 5) as h (h.salud_id)}
						<div
							class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
						>
							<div>
								<span class="font-medium">{h.tipo_evento}</span>
								{#if h.producto}
									<span class="ml-2 text-gray-500">{h.producto}</span>
								{/if}
							</div>
							<span class="text-xs text-gray-400">{fmtDate(h.fecha)}</span>
						</div>
					{/each}
				</div>
			</Card>
		{/if}

		{#if reproRecords.length > 0 || offspring.length > 0}
			<Card>
				<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
					Historial reproductivo
				</h3>

				<div class="space-y-3">
					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-gray-400">
							Fechas de montas vistas
						</p>
						{#if matingDates.length > 0}
							<div class="mt-2 flex flex-wrap gap-2">
								{#each matingDates as date}
									<span class="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-700">
										{fmtDate(date)}
									</span>
								{/each}
							</div>
						{:else}
							<p class="mt-1 text-sm text-gray-500">—</p>
						{/if}
					</div>

					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-gray-400">
							Fechas de partos inferidas
						</p>
						{#if inferredBirthDates.length > 0}
							<div class="mt-2 flex flex-wrap gap-2">
								{#each inferredBirthDates as date}
									<span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
										{fmtDate(date)}
									</span>
								{/each}
							</div>
						{:else}
							<p class="mt-1 text-sm text-gray-500">—</p>
						{/if}
					</div>

					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-gray-400">
							Fechas de partos reales
						</p>
						{#if actualBirthDates.length > 0}
							<div class="mt-2 flex flex-wrap gap-2">
								{#each actualBirthDates as date}
									<span class="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
										{fmtDate(date)}
									</span>
								{/each}
							</div>
						{:else}
							<p class="mt-1 text-sm text-gray-500">—</p>
						{/if}
					</div>

					<div>
						<p class="text-xs font-semibold uppercase tracking-wide text-gray-400">
							Lista de hijos
						</p>
						{#if offspring.length > 0}
							<div class="mt-2 space-y-2">
								{#each offspring as calf (calf.animal_id)}
									<a
										href="/ganado/{calf.animal_id}"
										class="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2 transition-colors active:bg-gray-100"
									>
										{#if calf.photoSrc}
											<ZoomablePhoto
												src={calf.photoSrc}
												alt={calf.nombre}
												imgClass="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-green-200"
											/>
										{:else}
											<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700">
												{calf.nombre?.charAt(0)?.toUpperCase() ?? '?'}
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="truncate font-medium text-gray-800">{calf.nombre}</p>
											<p class="text-xs text-gray-500">
												{formatTagId(calf.arete_id) || 'Sin arete'}
											</p>
										</div>
									</a>
								{/each}
							</div>
						{:else}
							<p class="mt-1 text-sm text-gray-500">—</p>
						{/if}
					</div>
				</div>
			</Card>
		{/if}
	</div>
{/if}
