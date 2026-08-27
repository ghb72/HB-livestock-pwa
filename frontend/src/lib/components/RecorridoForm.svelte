<script lang="ts">
	import { replaceWith } from '$lib/navigation.svelte';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import {
		Check,
		ChevronDown,
		ChevronUp,
		Eye,
		EyeOff,
		MapPin,
		Save
	} from 'lucide-svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { db } from '$lib/db';
	import { getAllPhotos } from '$lib/store';
	import DateField from '$lib/components/DateField.svelte';
	import { formatStoredDate, todayLocalDate } from '$lib/date';
	import { generateId, now, currentUserId, formatTagId } from '$lib/helpers';
	import Card from '$lib/components/Card.svelte';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';
	import type { Animal, RecorridoEntry } from '$lib/types';

	interface Props {
		recorridoId?: string;
	}

	let { recorridoId }: Props = $props();

	let isEdit = $derived(Boolean(recorridoId));
	let fecha = $state(todayLocalDate());
	let seen = $state(new Map<string, string>());
	let saving = $state(false);
	let loading = $state(false);
	let initialized = $state(false);
	let showNotSeen = $state(true);
	let showSeen = $state(true);
	let animals = $state<Animal[]>([]);
	let photoMap = $state(new Map<string, string>());

	let seenCount = $derived(seen.size);
	let totalCount = $derived(animals.length);

	let observed = $derived(animals.filter((a) => seen.has(a.animal_id)));
	let notObserved = $derived(animals.filter((a) => !seen.has(a.animal_id)));

	$effect(() => {
		loadAnimals();
	});

	$effect(() => {
		if (recorridoId && !initialized) {
			loadExisting(recorridoId);
		} else if (!recorridoId && !initialized) {
			initialized = true;
		}
	});

	async function loadAnimals() {
		const [allAnimals, allPhotos] = await Promise.all([
			db.animals.where('estado').equals('Vivo(a)').sortBy('nombre'),
			getAllPhotos()
		]);

		const nextPhotoMap = new Map<string, string>();
		for (const animal of allAnimals) {
			if (animal.foto_url) {
				nextPhotoMap.set(animal.animal_id, animal.foto_url);
			}
		}
		for (const photo of allPhotos) {
			if (photo.deleted === 0) {
				nextPhotoMap.set(photo.animal_id, photo.data_url || photo.photo_url);
			}
		}

		animals = allAnimals;
		photoMap = nextPhotoMap;
	}

	async function loadExisting(id: string) {
		loading = true;
		try {
			const entries = (await db.recorridos.where('recorrido_id').equals(id).toArray()).filter(
				(entry) => entry.deleted === 0
			);

			if (entries.length === 0) {
				replaceWith('/actividad/recorridos');
				return;
			}

			fecha = entries[0].fecha;
			seen = new Map(entries.map((entry) => [entry.animal_id, entry.notas]));
			initialized = true;
		} finally {
			loading = false;
		}
	}

	function toggleAnimal(animalId: string) {
		const next = new Map(seen);
		if (next.has(animalId)) {
			next.delete(animalId);
		} else {
			next.set(animalId, '');
		}
		seen = next;
	}

	function updateNote(animalId: string, note: string) {
		const next = new Map(seen);
		next.set(animalId, note);
		seen = next;
	}

	async function handleSave() {
		if (seenCount === 0 || saving) return;
		saving = true;
		try {
			const currentRecorridoId = recorridoId ?? generateId('REC');
			const timestamp = now();
			const userId = currentUserId();

			const entries: RecorridoEntry[] = Array.from(seen.entries()).map(([animalId, notas]) => ({
				entry_id: generateId('RCE'),
				recorrido_id: currentRecorridoId,
				fecha,
				animal_id: animalId,
				notas,
				synced: 0 as const,
				deleted: 0 as const,
				created_by: userId,
				updated_at: timestamp,
				created_at: timestamp
			}));

			await db.transaction('rw', db.recorridos, async () => {
				if (recorridoId) {
					await db.recorridos.where('recorrido_id').equals(recorridoId).modify({
						deleted: 1,
						synced: 0,
						updated_at: timestamp
					});
				}

				await db.recorridos.bulkAdd(entries);
			});

			replaceWith('/actividad/recorridos');
		} finally {
			saving = false;
		}
	}

	function formatToday(): string {
		try {
			return formatStoredDate(fecha, "EEEE d 'de' MMMM", es);
		} catch {
			return fecha;
		}
	}
</script>

<div class="mx-auto max-w-lg space-y-4 pb-24">
	<div class="flex items-center gap-3">
		<BackButton fallback="/actividad/recorridos" />
		<div>
			<div class="flex items-center gap-2">
				<MapPin size={22} class="text-green-600" />
				<h2 class="text-xl font-bold text-gray-800">
					{isEdit ? 'Editar recorrido' : 'Recorrido de campo'}
				</h2>
			</div>
			<p class="mt-1 text-sm capitalize text-gray-500">{formatToday()}</p>
		</div>
	</div>

	{#if loading}
		<div class="py-12 text-center text-gray-400">Cargando recorrido...</div>
	{:else}
		<div class="max-w-[220px]">
			<DateField label="Fecha" name="fecha" value={fecha} onchange={(value) => (fecha = value)} />
		</div>

		<div class="rounded-xl bg-white p-4 shadow-sm">
			<div class="mb-2 flex items-center justify-between">
				<span class="text-sm font-semibold text-gray-700">Progreso del recorrido</span>
				<span class="text-lg font-bold text-green-600">
					{seenCount}<span class="text-sm font-normal text-gray-400">/{totalCount}</span>
				</span>
			</div>
			<div class="h-3 w-full overflow-hidden rounded-full bg-gray-200">
				<div
					class="h-full rounded-full bg-green-500 transition-all duration-300"
					style="width: {totalCount > 0 ? (seenCount / totalCount) * 100 : 0}%"
				></div>
			</div>
		</div>

		<section>
			<button
				onclick={() => (showNotSeen = !showNotSeen)}
				class="mb-2 flex w-full items-center justify-between"
			>
				<div class="flex items-center gap-2">
					<EyeOff size={18} class="text-red-500" />
					<span class="text-sm font-semibold text-gray-700">
						No observados ({notObserved.length})
					</span>
				</div>
				{#if showNotSeen}
					<ChevronUp size={18} class="text-gray-400" />
				{:else}
					<ChevronDown size={18} class="text-gray-400" />
				{/if}
			</button>
			{#if showNotSeen}
				<div class="space-y-1.5">
					{#each notObserved as animal (animal.animal_id)}
						{@const photoSrc = photoMap.get(animal.animal_id)}
						<Card class="overflow-hidden">
							<div class="flex items-center gap-3">
								<div class="relative h-12 w-12 shrink-0">
									{#if photoSrc}
										<ZoomablePhoto
											src={photoSrc}
											alt={animal.nombre || 'Animal'}
											imgClass="h-12 w-12 rounded-full object-cover ring-2 ring-gray-200"
										/>
									{:else}
										<div
											class="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-500 ring-2 ring-gray-200"
										>
											{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
										</div>
									{/if}
									<button
										onclick={() => toggleAnimal(animal.animal_id)}
										class="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-transparent shadow-sm transition-colors"
										aria-label="Marcar animal como visto"
									>
										<Check size={14} strokeWidth={3} class="text-gray-300" />
									</button>
								</div>
								<button
									onclick={() => toggleAnimal(animal.animal_id)}
									class="min-w-0 flex-1 text-left"
								>
									<div class="flex items-center gap-2">
										<span class="truncate font-semibold text-gray-800">
											{animal.nombre || 'Sin nombre'}
										</span>
										<span class="shrink-0 text-xs text-gray-400">
											{formatTagId(animal.arete_id) || '—'}
										</span>
									</div>
									<div class="flex gap-2 text-xs text-gray-500">
										<span>{animal.tipo}</span>
										<span>{animal.sexo}</span>
										{#if animal.raza}
											<span>· {animal.raza}</span>
										{/if}
									</div>
								</button>
							</div>
						</Card>
					{/each}
					{#if notObserved.length === 0}
						<p class="py-4 text-center text-sm text-gray-400">
							¡Todos los animales fueron observados! 🎉
						</p>
					{/if}
				</div>
			{/if}
		</section>

		<section>
			<button
				onclick={() => (showSeen = !showSeen)}
				class="mb-2 flex w-full items-center justify-between"
			>
				<div class="flex items-center gap-2">
					<Eye size={18} class="text-green-600" />
					<span class="text-sm font-semibold text-gray-700">
						Observados ({observed.length})
					</span>
				</div>
				{#if showSeen}
					<ChevronUp size={18} class="text-gray-400" />
				{:else}
					<ChevronDown size={18} class="text-gray-400" />
				{/if}
			</button>
			{#if showSeen}
				<div class="space-y-1.5">
					{#each observed as animal (animal.animal_id)}
						{@const photoSrc = photoMap.get(animal.animal_id)}
						<Card class="overflow-hidden">
							<div class="flex items-center gap-3">
								<div class="relative h-12 w-12 shrink-0">
									{#if photoSrc}
										<ZoomablePhoto
											src={photoSrc}
											alt={animal.nombre || 'Animal'}
											imgClass="h-12 w-12 rounded-full object-cover ring-2 ring-green-200"
										/>
									{:else}
										<div
											class="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-lg font-bold text-green-700 ring-2 ring-green-200"
										>
											{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
										</div>
									{/if}
									<button
										onclick={() => toggleAnimal(animal.animal_id)}
										class="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-green-600 text-white shadow-sm transition-colors"
										aria-label="Desmarcar animal"
									>
										<Check size={14} strokeWidth={3} />
									</button>
								</div>
								<button
									onclick={() => toggleAnimal(animal.animal_id)}
									class="min-w-0 flex-1 text-left"
								>
									<div class="flex items-center gap-2">
										<span class="truncate font-semibold text-green-700">
											{animal.nombre || 'Sin nombre'}
										</span>
										<span class="shrink-0 text-xs text-gray-400">
											{formatTagId(animal.arete_id) || '—'}
										</span>
									</div>
									<div class="flex gap-2 text-xs text-gray-500">
										<span>{animal.tipo}</span>
										<span>{animal.sexo}</span>
										{#if animal.raza}
											<span>· {animal.raza}</span>
										{/if}
									</div>
								</button>
							</div>
							<div class="mt-2 border-t border-gray-100 pt-2">
								<input
									type="text"
									value={seen.get(animal.animal_id) ?? ''}
									oninput={(e) => updateNote(animal.animal_id, e.currentTarget.value)}
									placeholder="Nota rápida (opcional)..."
									class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
								/>
							</div>
						</Card>
					{/each}
					{#if observed.length === 0}
						<p class="py-4 text-center text-sm text-gray-400">
							Marca los animales que vayas viendo.
						</p>
					{/if}
				</div>
			{/if}
		</section>

		<button
			type="button"
			onclick={handleSave}
			disabled={saving || seenCount === 0}
			class="fixed bottom-20 left-1/2 flex w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 items-center justify-center gap-2 rounded-2xl bg-green-600 px-6 py-4 font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50"
		>
			<Save size={18} />
			{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Guardar recorrido'}
		</button>
	{/if}
</div>