<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { db } from '$lib/db';
	import { generateId, now, currentUserId } from '$lib/helpers';
	import Card from '$lib/components/Card.svelte';
	import type { Animal, RecorridoEntry } from '$lib/types';

	let fecha = $state(format(new Date(), 'yyyy-MM-dd'));
	let seen = $state(new Map<string, string>());
	let saving = $state(false);
	let showNotSeen = $state(true);
	let showSeen = $state(true);
	let animals = $state<Animal[]>([]);

	let seenCount = $derived(seen.size);
	let totalCount = $derived(animals.length);

	let observed = $derived(animals.filter((a) => seen.has(a.animal_id)));
	let notObserved = $derived(animals.filter((a) => !seen.has(a.animal_id)));

	$effect(() => {
		loadAnimals();
	});

	async function loadAnimals() {
		animals = await db.animals.where('estado').equals('Vivo(a)').sortBy('nombre');
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
		if (seenCount === 0) return;
		saving = true;
		try {
			const recorridoId = generateId('REC');
			const timestamp = now();
			const userId = currentUserId();

			const entries: RecorridoEntry[] = Array.from(seen.entries()).map(
				([animalId, notas]) => ({
					entry_id: generateId('RCE'),
					recorrido_id: recorridoId,
					fecha,
					animal_id: animalId,
					notas,
					synced: 0 as const,
					deleted: 0 as const,
					created_by: userId,
					updated_at: timestamp,
					created_at: timestamp
				})
			);

			await db.recorridos.bulkAdd(entries);
			goto('/actividad/recorridos');
		} finally {
			saving = false;
		}
	}

	function formatToday(): string {
		try {
			return format(new Date(fecha), "EEEE d 'de' MMMM", { locale: es });
		} catch {
			return fecha;
		}
	}
</script>

<div class="mx-auto max-w-lg space-y-4 pb-24">
	<div>
		<div class="flex items-center gap-2">
			<MapPin size={22} class="text-green-600" />
			<h2 class="text-xl font-bold text-gray-800">Recorrido de campo</h2>
		</div>
		<p class="mt-1 text-sm capitalize text-gray-500">{formatToday()}</p>
	</div>

	<div class="flex items-center gap-3">
		<label for="fecha" class="text-sm font-medium text-gray-600">Fecha:</label>
		<input
			id="fecha"
			type="date"
			value={fecha}
			onchange={(e) => (fecha = e.currentTarget.value)}
			class="rounded-lg border border-gray-300 px-3 py-2 text-sm"
		/>
	</div>

	<!-- Progress bar -->
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

	<!-- Not observed -->
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
					<Card class="overflow-hidden">
						<div class="flex items-center gap-3">
							<button
								onclick={() => toggleAnimal(animal.animal_id)}
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-transparent transition-colors"
								aria-label="Marcar animal como visto"
							>
								<Check size={20} strokeWidth={3} />
							</button>
							<button
								onclick={() => toggleAnimal(animal.animal_id)}
								class="min-w-0 flex-1 text-left"
							>
								<div class="flex items-center gap-2">
									<span class="truncate font-semibold text-gray-800">
										{animal.nombre || 'Sin nombre'}
									</span>
									<span class="shrink-0 text-xs text-gray-400">
										#{animal.arete_id || '—'}
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

	<!-- Observed -->
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
					<Card class="overflow-hidden">
						<div class="flex items-center gap-3">
							<button
								onclick={() => toggleAnimal(animal.animal_id)}
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white transition-colors"
								aria-label="Desmarcar animal"
							>
								<Check size={20} strokeWidth={3} />
							</button>
							<button
								onclick={() => toggleAnimal(animal.animal_id)}
								class="min-w-0 flex-1 text-left"
							>
								<div class="flex items-center gap-2">
									<span class="truncate font-semibold text-green-700">
										{animal.nombre || 'Sin nombre'}
									</span>
									<span class="shrink-0 text-xs text-gray-400">
										#{animal.arete_id || '—'}
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

	<!-- Floating save button -->
	<div class="fixed inset-x-0 bottom-16 z-20 px-4 pb-4">
		<div class="mx-auto max-w-lg">
			<button
				onclick={handleSave}
				disabled={saving || seenCount === 0}
				class="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition-colors active:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500"
			>
				<Save size={22} />
				{saving ? 'Guardando...' : `Guardar recorrido (${seenCount} animales)`}
			</button>
		</div>
	</div>
</div>
