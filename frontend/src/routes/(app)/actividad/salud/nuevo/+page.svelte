<script lang="ts">
	import { ArrowLeft, Save, Check, StickyNote, X, Loader2 } from 'lucide-svelte';
	import FormField from '$lib/components/FormField.svelte';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';
	import { db } from '$lib/db';
	import { getAllPhotos } from '$lib/store';
	import { todayLocalDate } from '$lib/date';
	import { generateId, now, currentUserId, formatTagId } from '$lib/helpers';
	import type { Animal, TipoEventoSalud, EstadoGeneral, HealthRecord } from '$lib/types';

	const TIPOS_EVENTO: TipoEventoSalud[] = [
		'Vacuna',
		'Desparasitación',
		'Vitamina',
		'Enfermedad',
		'Tratamiento',
		'Revisión'
	];
	const ESTADOS_GENERAL: EstadoGeneral[] = ['Fuerte', 'Flaco', 'Enfermo'];

	const SHORT_LABELS: Record<TipoEventoSalud, string> = {
		Vacuna: 'Vac',
		Desparasitación: 'Des',
		Vitamina: 'Vit',
		Enfermedad: 'Enf',
		Tratamiento: 'Tra',
		Revisión: 'Rev'
	};

	interface EventConfig {
		producto: string;
		dosis: string;
	}

	interface AnimalRow {
		checked: Record<string, boolean>;
		estado_general: EstadoGeneral;
		nota: string;
		noteOpen: boolean;
	}

	let saving = $state(false);
	let selectedTypes = $state<TipoEventoSalud[]>([]);
	let eventConfigs = $state<Record<string, EventConfig>>({});
	let proximaAplicacion = $state('');
	let fecha = $state(todayLocalDate());
	let animals = $state<Animal[]>([]);
	let photoMap = $state(new Map<string, string>());
	let rows = $state<Record<string, AnimalRow>>({});

	$effect(() => {
		loadAnimals();
	});

	async function loadAnimals() {
		const [allAnimals, allPhotos] = await Promise.all([
			db.animals
				.where('deleted')
				.equals(0)
				.filter((a) => a.estado === 'Vivo(a)')
				.toArray(),
			getAllPhotos()
		]);

		allAnimals.sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'));

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

	function getRow(id: string): AnimalRow {
		return (
			rows[id] ?? { checked: {}, estado_general: 'Fuerte' as EstadoGeneral, nota: '', noteOpen: false }
		);
	}

	function updateRow(id: string, patch: Partial<AnimalRow>) {
		rows = { ...rows, [id]: { ...getRow(id), ...patch } };
	}

	function toggleType(tipo: TipoEventoSalud) {
		if (selectedTypes.includes(tipo)) {
			selectedTypes = selectedTypes.filter((t) => t !== tipo);
		} else {
			selectedTypes = [...selectedTypes, tipo];
			if (!eventConfigs[tipo]) {
				eventConfigs = { ...eventConfigs, [tipo]: { producto: '', dosis: '' } };
			}
		}
	}

	function toggleAnimalCheck(animalId: string, tipo: string) {
		const row = getRow(animalId);
		updateRow(animalId, { checked: { ...row.checked, [tipo]: !row.checked[tipo] } });
	}

	function toggleAll(tipo: string) {
		const shouldCheck = !animals.every((a) => getRow(a.animal_id).checked[tipo]);
		const next = { ...rows };
		for (const a of animals) {
			const row = next[a.animal_id] ?? {
				checked: {},
				estado_general: 'Fuerte' as EstadoGeneral,
				nota: '',
				noteOpen: false
			};
			next[a.animal_id] = { ...row, checked: { ...row.checked, [tipo]: shouldCheck } };
		}
		rows = next;
	}

	let recordCount = $derived.by(() => {
		let count = 0;
		for (const a of animals) {
			const row = getRow(a.animal_id);
			for (const tipo of selectedTypes) {
				if (row.checked[tipo]) count++;
			}
		}
		return count;
	});

	async function handleSave() {
		if (saving || recordCount === 0) return;
		saving = true;
		try {
			const timestamp = now();
			const userId = currentUserId();
			const records: HealthRecord[] = [];

			for (const animal of animals) {
				const row = getRow(animal.animal_id);
				for (const tipo of selectedTypes) {
					if (!row.checked[tipo]) continue;
					const config = eventConfigs[tipo] ?? { producto: '', dosis: '' };
					records.push({
						salud_id: generateId('SAL'),
						animal_id: animal.animal_id,
						fecha,
						tipo_evento: tipo,
						producto: config.producto,
						dosis: config.dosis,
						estado_general: row.estado_general,
						proxima_aplicacion: proximaAplicacion,
						notas: row.nota,
						synced: 0,
						deleted: 0,
						created_by: userId,
						updated_at: timestamp,
						created_at: timestamp
					});
				}
			}

			await db.health.bulkAdd(records);
			history.back();
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-lg space-y-4 pb-6">
	<div class="flex items-center gap-3">
		<button
			onclick={() => history.back()}
			class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
			aria-label="Volver"
		>
			<ArrowLeft size={24} />
		</button>
		<h2 class="text-xl font-bold text-gray-800">Evento de salud masivo</h2>
	</div>

	<!-- Event type multi-selector -->
	<section class="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
		<p class="mb-2 text-sm font-semibold text-gray-700">Tipo de evento</p>
		<div class="flex flex-wrap gap-2">
			{#each TIPOS_EVENTO as tipo}
				{@const active = selectedTypes.includes(tipo)}
				<button
					type="button"
					onclick={() => toggleType(tipo)}
					class="rounded-full border px-3 py-1.5 text-sm font-medium transition-colors {active
						? 'border-blue-600 bg-blue-600 text-white'
						: 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'}"
				>
					{tipo}
				</button>
			{/each}
		</div>
	</section>

	<!-- Per-type product & dose -->
	{#if selectedTypes.length > 0}
		<section class="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
			{#each selectedTypes as tipo}
				{@const config = eventConfigs[tipo] ?? { producto: '', dosis: '' }}
				<div>
					<p class="mb-1 text-xs font-bold uppercase tracking-wider text-blue-600">{tipo}</p>
					<div class="grid grid-cols-2 gap-2">
						<FormField
							label="Producto"
							name="producto-{tipo}"
							value={config.producto}
							onchange={(v) =>
								(eventConfigs = {
									...eventConfigs,
									[tipo]: { ...config, producto: v }
								})}
							placeholder="Ej: Ivermectina"
						/>
						<FormField
							label="Dosis"
							name="dosis-{tipo}"
							value={config.dosis}
							onchange={(v) =>
								(eventConfigs = {
									...eventConfigs,
									[tipo]: { ...config, dosis: v }
								})}
							placeholder="Ej: 5 ml"
						/>
					</div>
				</div>
			{/each}

			<div class="grid grid-cols-2 gap-2">
				<FormField
					label="Fecha del evento"
					name="fecha"
					type="date"
					value={fecha}
					onchange={(v) => (fecha = v)}
				/>
				<FormField
					label="Próxima aplicación"
					name="proxima_aplicacion"
					type="date"
					value={proximaAplicacion}
					onchange={(v) => (proximaAplicacion = v)}
				/>
			</div>
		</section>

		<!-- Animal checklist -->
		<section class="rounded-xl border border-gray-200 bg-white shadow-sm">
			<div
				class="sticky top-0 z-10 flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500"
			>
				<span class="flex-1">Animal</span>
				{#each selectedTypes as tipo}
					<button
						type="button"
						onclick={() => toggleAll(tipo)}
						class="w-12 text-center"
						title="Marcar/desmarcar todos — {tipo}"
					>
						{SHORT_LABELS[tipo]}
					</button>
				{/each}
				<span class="w-20 text-center">Estado</span>
				<span class="w-8"></span>
			</div>

			<div class="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto">
				{#each animals as animal (animal.animal_id)}
					{@const row = getRow(animal.animal_id)}
					{@const photoSrc = photoMap.get(animal.animal_id)}
					<div>
						<div class="flex items-center gap-1 px-3 py-2">
							<div class="flex min-w-0 flex-1 items-center gap-3">
								{#if photoSrc}
									<ZoomablePhoto
										src={photoSrc}
										alt={animal.nombre || 'Animal'}
										imgClass="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-blue-100"
									/>
								{:else}
									<div
										class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 ring-2 ring-blue-100"
									>
										{animal.nombre?.charAt(0)?.toUpperCase() ?? '?'}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-semibold text-gray-800">
									{animal.nombre || formatTagId(animal.arete_id) || animal.animal_id}
								</p>
								<p class="truncate text-xs text-gray-400">{animal.animal_id}</p>
								</div>
							</div>
							{#each selectedTypes as tipo}
								<button
									type="button"
									onclick={() => toggleAnimalCheck(animal.animal_id, tipo)}
									class="flex h-9 w-12 items-center justify-center rounded-lg transition-colors {row
										.checked[tipo]
										? 'bg-green-600 text-white'
										: 'bg-gray-100 text-gray-300'}"
									aria-label="{tipo} — {animal.nombre}"
								>
									<Check size={18} strokeWidth={3} />
								</button>
							{/each}
							<select
								value={row.estado_general}
								onchange={(e) =>
									updateRow(animal.animal_id, {
										estado_general: e.currentTarget.value as EstadoGeneral
									})}
								class="w-20 rounded-lg border border-gray-200 bg-white px-1 py-1.5 text-xs text-gray-700"
							>
								{#each ESTADOS_GENERAL as e}
									<option value={e}>{e}</option>
								{/each}
							</select>
							<button
								type="button"
								onclick={() =>
									updateRow(animal.animal_id, { noteOpen: !row.noteOpen })}
								class="flex h-8 w-8 items-center justify-center rounded-lg transition-colors {row.nota
									? 'bg-amber-100 text-amber-600'
									: 'text-gray-300 hover:text-gray-500'}"
								aria-label="Nota"
							>
								{#if row.noteOpen}
									<X size={16} />
								{:else}
									<StickyNote size={16} />
								{/if}
							</button>
						</div>
						{#if row.noteOpen}
							<div class="px-3 pb-2">
								<textarea
									value={row.nota}
									oninput={(e) =>
										updateRow(animal.animal_id, { nota: e.currentTarget.value })}
									placeholder="Nota para este animal..."
									rows="2"
									class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
								></textarea>
							</div>
						{/if}
					</div>
				{/each}
				{#if animals.length === 0}
					<p class="py-6 text-center text-sm text-gray-400">
						No hay animales vivos registrados.
					</p>
				{/if}
			</div>
		</section>
	{/if}

	<!-- Save button -->
	<button
		type="button"
		onclick={handleSave}
		disabled={saving || recordCount === 0}
		class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
	>
		{#if saving}
			<Loader2 size={20} class="animate-spin" />
		{:else}
			<Save size={20} />
		{/if}
		{saving ? 'Guardando...' : `Guardar ${recordCount} registro${recordCount !== 1 ? 's' : ''}`}
	</button>
</div>
