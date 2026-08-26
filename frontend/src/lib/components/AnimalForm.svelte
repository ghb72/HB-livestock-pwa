<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft, Save } from 'lucide-svelte';
	import { format, subDays } from 'date-fns';
	import FormField from './FormField.svelte';
	import SelectField from './SelectField.svelte';
	import PhotoCapture from './PhotoCapture.svelte';
	import { db } from '$lib/db';
	import { parseStoredDate, todayLocalDate } from '$lib/date';
	import { formatTagId } from '$lib/helpers';
	import {
		createAnimal,
		createReproductionRecord,
		deleteReproductionRecord,
		updateAnimal,
		updateReproductionRecord,
		getAnimal,
		getPhotos,
		addPhoto,
		deletePhoto
	} from '$lib/store';
	import type { AnimalTipo, Sexo, Temperamento, EstadoAnimal } from '$lib/types';

	type SelectOption = {
		value: string;
		label: string;
	};

	interface Props {
		animalId?: string;
	}

	const GESTATION_DAYS = 283;
	const INFERRED_BIRTH_NOTE = 'Parto inferido automaticamente desde el registro del animal.';

	let { animalId }: Props = $props();

	let isEdit = $derived(Boolean(animalId));

	const TIPOS: AnimalTipo[] = ['Semental', 'Becerro(a)', 'Vaquilla', 'Vaca', 'Torete'];
	const SEXOS: Sexo[] = ['Macho', 'Hembra'];
	const TEMPERAMENTOS: Temperamento[] = ['Normal', 'Manso(a)', 'Bravo(a)'];
	const ESTADOS: EstadoAnimal[] = ['Vivo(a)', 'Muerto(a)', 'Vendido(a)'];

	let saving = $state(false);
	let photoData = $state('');
	let initialized = $state(false);

	let form = $state({
		arete_id: '',
		nombre: '',
		tipo: 'Vaca' as AnimalTipo,
		sexo: 'Hembra' as Sexo,
		fecha_nacimiento: '',
		raza: '',
		madre_id: '',
		padre_id: '',
		temperamento: 'Normal' as Temperamento,
		estado: 'Vivo(a)' as EstadoAnimal,
		peso_actual: null as number | null,
		notas: '',
		foto_url: ''
	});

	let mothers = $state<SelectOption[]>([]);
	let fathers = $state<SelectOption[]>([]);

	$effect(() => {
		loadParents();
		if (isEdit && animalId && !initialized) {
			loadExisting(animalId);
		}
	});

	async function loadParents() {
		const allAnimals = await db.animals.where('deleted').equals(0).toArray();
		mothers = allAnimals
			.filter(
				(a) =>
					a.tipo === 'Vaca' &&
					a.sexo === 'Hembra' &&
					a.estado === 'Vivo(a)' &&
					(!animalId || a.animal_id !== animalId)
			)
			.map((a) => ({
				value: a.animal_id,
				label: `${a.nombre} ${formatTagId(a.arete_id)}`.trim()
			}));
		fathers = allAnimals
			.filter(
				(a) => a.tipo === 'Semental' && a.sexo === 'Macho' && (!animalId || a.animal_id !== animalId)
			)
			.map((a) => ({
				value: a.animal_id,
				label: `${a.nombre} ${formatTagId(a.arete_id)}`.trim()
			}));
	}

	async function loadExisting(id: string) {
		const existing = await getAnimal(id);
		if (!existing) return;

		form = {
			arete_id: existing.arete_id,
			nombre: existing.nombre,
			tipo: existing.tipo,
			sexo: existing.sexo,
			fecha_nacimiento: existing.fecha_nacimiento,
			raza: existing.raza,
			madre_id: existing.madre_id,
			padre_id: existing.padre_id,
			temperamento: existing.temperamento,
			estado: existing.estado,
			peso_actual: existing.peso_actual,
			notas: existing.notas,
			foto_url: existing.foto_url
		};

		const photos = await getPhotos(id);
		if (photos.length > 0) {
			photoData = photos[0].data_url || photos[0].photo_url;
		} else if (existing.foto_url) {
			photoData = existing.foto_url;
		}

		initialized = true;
	}

	async function syncInferredBirthRecord(animalId: string, pesoActual: number | null) {
		const existingBirth = await db.reproduction
			.where('deleted')
			.equals(0)
			.filter((record) => record.cria_id === animalId && !!record.fecha_parto_real)
			.first();

		const motherId = form.madre_id.trim();
		if (!motherId) {
			if (existingBirth?.notas === INFERRED_BIRTH_NOTE) {
				await deleteReproductionRecord(existingBirth.reproduccion_id);
			}
			return;
		}

		if (existingBirth && existingBirth.notas !== INFERRED_BIRTH_NOTE) return;

		const birthDate = form.fecha_nacimiento || todayLocalDate();
		const parsedBirthDate = parseStoredDate(birthDate);
		const inferredMatingDate = parsedBirthDate
			? format(subDays(parsedBirthDate, GESTATION_DAYS), 'yyyy-MM-dd')
			: '';
		const reproductionPayload = {
			vaca_id: motherId,
			semental_id: form.padre_id.trim(),
			fecha_monta: inferredMatingDate,
			fecha_posible_parto: birthDate,
			prenez_confirmada: 'Sí' as const,
			fecha_parto_real: birthDate,
			cria_id: animalId,
			peso_destete_cria: pesoActual,
			notas: INFERRED_BIRTH_NOTE
		};

		if (existingBirth) {
			await updateReproductionRecord(existingBirth.reproduccion_id, reproductionPayload);
			return;
		}

		await createReproductionRecord(reproductionPayload);
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;

		try {
			const peso = form.peso_actual ? Number(form.peso_actual) : null;

			if (isEdit && animalId) {
				await updateAnimal(animalId, {
					...form,
					madre_id: form.madre_id,
					padre_id: form.padre_id,
					peso_actual: peso
				});

				await syncInferredBirthRecord(animalId, peso);

				if (photoData && photoData.startsWith('data:')) {
					const existing = await getPhotos(animalId);
					if (existing.length > 0) {
						await deletePhoto(existing[0].photo_id);
					}
					await addPhoto(animalId, photoData);
				} else if (!photoData) {
					const existing = await getPhotos(animalId);
					for (const p of existing) {
						await deletePhoto(p.photo_id);
					}
				}
			} else {
				const animal = await createAnimal({
					...form,
					madre_id: form.madre_id,
					padre_id: form.padre_id,
					peso_actual: peso
				});

				await syncInferredBirthRecord(animal.animal_id, peso);

				if (photoData && photoData.startsWith('data:')) {
					await addPhoto(animal.animal_id, photoData);
				}
			}

			goto('/ganado', { replaceState: true });
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center gap-3">
		<button
			onclick={() => history.back()}
			class="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200"
			aria-label="Volver"
		>
			<ArrowLeft size={24} />
		</button>
		<h2 class="text-xl font-bold text-gray-800">
			{isEdit ? 'Editar animal' : 'Registrar animal'}
		</h2>
	</div>

	<form onsubmit={handleSubmit} class="space-y-4">
		<PhotoCapture value={photoData} onchange={(v) => (photoData = v)} />

		<FormField
			label="Nombre"
			name="nombre"
			value={form.nombre}
			onchange={(v) => (form.nombre = v)}
			placeholder="Ej: La Morenita"
			required
		/>

		<FormField
			label="No. Arete (ID)"
			name="arete_id"
			value={form.arete_id}
			onchange={(v) => (form.arete_id = v)}
			placeholder="Ej: 1234"
		/>

		<div class="grid grid-cols-2 gap-3">
			<SelectField
				label="Tipo"
				name="tipo"
				value={form.tipo}
				onchange={(v) => (form.tipo = v as AnimalTipo)}
				options={TIPOS}
				required
			/>
			<SelectField
				label="Sexo"
				name="sexo"
				value={form.sexo}
				onchange={(v) => (form.sexo = v as Sexo)}
				options={SEXOS}
				required
			/>
		</div>

		<FormField
			label="Fecha de nacimiento"
			name="fecha_nacimiento"
			type="date"
			value={form.fecha_nacimiento}
			onchange={(v) => (form.fecha_nacimiento = v)}
		/>

		<FormField
			label="Raza"
			name="raza"
			value={form.raza}
			onchange={(v) => (form.raza = v)}
			placeholder="Ej: Brahman, Angus, Criollo"
		/>

		<div class="grid grid-cols-2 gap-3">
			<SelectField
				label="Madre"
				name="madre_id"
				value={form.madre_id}
				onchange={(v) => (form.madre_id = v)}
				options={mothers}
				placeholder="Sin madre"
			/>
			<SelectField
				label="Padre"
				name="padre_id"
				value={form.padre_id}
				onchange={(v) => (form.padre_id = v)}
				options={fathers}
				placeholder="Sin padre"
			/>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<SelectField
				label="Temperamento"
				name="temperamento"
				value={form.temperamento}
				onchange={(v) => (form.temperamento = v as Temperamento)}
				options={TEMPERAMENTOS}
			/>
			<SelectField
				label="Estado"
				name="estado"
				value={form.estado}
				onchange={(v) => (form.estado = v as EstadoAnimal)}
				options={ESTADOS}
			/>
		</div>

		<FormField
			label="Peso actual (kg)"
			name="peso_actual"
			type="number"
			value={form.peso_actual ?? ''}
			onchange={(v) => (form.peso_actual = v ? Number(v) : null)}
			placeholder="Ej: 350"
		/>

		<FormField
			label="Notas"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(v) => (form.notas = v)}
			placeholder="Observaciones generales..."
		/>

		<button
			type="submit"
			disabled={saving || !form.nombre}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-green-700 disabled:opacity-50"
		>
			<Save size={20} />
			{saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Registrar animal'}
		</button>
	</form>
</div>
