<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Save, Info } from 'lucide-svelte';
	import { addDays, subDays, format } from 'date-fns';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { db } from '$lib/db';
	import { parseStoredDate, todayLocalDate } from '$lib/date';
	import {
		createReproductionRecord,
		createAnimal,
		getReproductionRecord,
		updateReproductionRecord
	} from '$lib/store';
	import type { PrenezEstado, ReproductionRecord } from '$lib/types';

	const PRENEZ_OPTIONS: PrenezEstado[] = ['Pendiente', 'Sí', 'No'];
	const SEXOS = ['Macho', 'Hembra'] as const;
	const GESTATION_DAYS = 283;
	const EXTERNAL_BULL_LABEL = 'Toro externo (ver notas)';

	type EventMode = 'monta' | 'parto';

	interface Props {
		reproductionId?: string;
		readonly?: boolean;
	}

	let { reproductionId, readonly = false }: Props = $props();

	const preselected = page.url.searchParams.get('animal') ?? '';
	const todayStr = () => todayLocalDate();
	const gestationAgo = () => format(subDays(new Date(), GESTATION_DAYS), 'yyyy-MM-dd');

	let saving = $state(false);
	let loaded = $state(false);
	let mode = $state<EventMode>('monta');
	let userEditedMonta = $state(false);
	let userEditedParto = $state(false);

	let cows = $state<string[]>([]);
	let bullOptions = $state<string[]>([]);
	let allAnimalOptions = $state<string[]>([]);
	let animalLabelMap = $state(new Map<string, string>());

	let form = $state({
		vaca_id: preselected,
		semental_id: '',
		fecha_monta: todayStr(),
		prenez_confirmada: 'Pendiente' as string,
		fecha_parto_real: '',
		cria_id: '',
		peso_destete_cria: '',
		notas: ''
	});

	let calf = $state({
		nombre: '',
		arete_id: '',
		sexo: 'Hembra' as 'Macho' | 'Hembra',
		raza: '',
		peso_nacimiento: ''
	});

	let fechaPosibleParto = $derived(
		form.fecha_monta
			? format(addDays(parseStoredDate(form.fecha_monta) ?? new Date(form.fecha_monta), GESTATION_DAYS), 'yyyy-MM-dd')
			: ''
	);

	let isExternalBull = $derived(form.semental_id === EXTERNAL_BULL_LABEL);
	let isExistingRecord = $derived(!!reproductionId);
	let modeLocked = $derived(readonly || isExistingRecord);
	let showCalfCreation = $derived(!readonly && !isExistingRecord && mode === 'parto');
	let canSubmit = $derived(
		!readonly &&
			!!form.vaca_id &&
			!!form.semental_id &&
			(!showCalfCreation || (!!calf.nombre && !!calf.sexo))
	);

	$effect(() => {
		void reproductionId;
		loadData();
	});

	async function loadData() {
		loaded = false;
		userEditedMonta = false;
		userEditedParto = false;

		const animals = await db.animals.where('deleted').equals(0).toArray();
		animalLabelMap = new Map(animals.map((animal) => [animal.animal_id, `${animal.animal_id} - ${animal.nombre}`]));

		cows = animals
			.filter((animal) => animal.sexo === 'Hembra')
			.map((animal) => `${animal.animal_id} - ${animal.nombre}`);
		bullOptions = [
			...animals
				.filter((animal) => animal.sexo === 'Macho')
				.map((animal) => `${animal.animal_id} - ${animal.nombre}`),
			EXTERNAL_BULL_LABEL
		];
		allAnimalOptions = animals.map((animal) => `${animal.animal_id} - ${animal.nombre}`);

		if (reproductionId) {
			const record = await getReproductionRecord(reproductionId);
			if (record) {
				loadRecord(record);
			}
		} else {
			resetFormForCreate();
			if (preselected && !form.vaca_id.includes(' - ')) {
				const match = cows.find((option) => option.startsWith(preselected));
				if (match) form.vaca_id = match;
			}
		}

		loaded = true;
	}

	function resetFormForCreate() {
		mode = 'monta';
		form = {
			vaca_id: preselected,
			semental_id: '',
			fecha_monta: todayStr(),
			prenez_confirmada: 'Pendiente',
			fecha_parto_real: '',
			cria_id: '',
			peso_destete_cria: '',
			notas: ''
		};
		calf = {
			nombre: '',
			arete_id: '',
			sexo: 'Hembra',
			raza: '',
			peso_nacimiento: ''
		};
	}

	function toOptionValue(id: string) {
		return animalLabelMap.get(id) ?? id;
	}

	function loadRecord(record: ReproductionRecord) {
		mode = record.fecha_parto_real ? 'parto' : 'monta';
		form = {
			vaca_id: toOptionValue(record.vaca_id),
			semental_id: record.semental_id === 'EXTERNO' ? EXTERNAL_BULL_LABEL : toOptionValue(record.semental_id),
			fecha_monta: record.fecha_monta,
			prenez_confirmada: record.prenez_confirmada,
			fecha_parto_real: record.fecha_parto_real,
			cria_id: record.cria_id ? toOptionValue(record.cria_id) : '',
			peso_destete_cria: record.peso_destete_cria ? String(record.peso_destete_cria) : '',
			notas: record.notas
		};
		calf = {
			nombre: '',
			arete_id: '',
			sexo: 'Hembra',
			raza: '',
			peso_nacimiento: ''
		};
	}

	function switchMode(newMode: EventMode) {
		if (modeLocked) return;
		mode = newMode;
		if (newMode === 'monta') {
			if (!userEditedMonta) form.fecha_monta = todayStr();
			form.fecha_parto_real = '';
		} else {
			if (!userEditedMonta) form.fecha_monta = gestationAgo();
			if (!userEditedParto) form.fecha_parto_real = todayStr();
			form.prenez_confirmada = 'Sí';
		}
	}

	function extractId(value: string) {
		return value.split(' - ')[0] ?? value;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (saving || readonly) return;
		saving = true;

		try {
			const vacaId = extractId(form.vaca_id);
			const sementalId = isExternalBull ? 'EXTERNO' : extractId(form.semental_id);
			const reproductionPayload = {
				vaca_id: vacaId,
				semental_id: sementalId,
				fecha_monta: form.fecha_monta,
				fecha_posible_parto: fechaPosibleParto,
				prenez_confirmada: mode === 'parto' ? ('Sí' as PrenezEstado) : (form.prenez_confirmada as PrenezEstado),
				fecha_parto_real: mode === 'parto' ? form.fecha_parto_real : '',
				cria_id: form.cria_id ? extractId(form.cria_id) : '',
				peso_destete_cria: form.peso_destete_cria ? Number(form.peso_destete_cria) : null,
				notas: form.notas
			};

			if (reproductionId) {
				await updateReproductionRecord(reproductionId, reproductionPayload);
				goto(`/actividad/reproduccion/${reproductionId}`, { replaceState: true });
				return;
			}

			if (showCalfCreation) {
				const allAnimals = await db.animals.where('deleted').equals(0).toArray();
				const motherAnimal = allAnimals.find((animal) => animal.animal_id === vacaId);
				const calfRaza = calf.raza || motherAnimal?.raza || '';

				const newCalf = await createAnimal({
					arete_id: calf.arete_id,
					nombre: calf.nombre,
					tipo: 'Becerro(a)',
					sexo: calf.sexo,
					fecha_nacimiento: form.fecha_parto_real || todayStr(),
					raza: calfRaza,
					madre_id: vacaId,
					padre_id: sementalId,
					temperamento: 'Normal',
					estado: 'Vivo(a)',
					peso_actual: calf.peso_nacimiento ? Number(calf.peso_nacimiento) : null,
					notas: '',
					foto_url: ''
				});

				await createReproductionRecord({
					...reproductionPayload,
					cria_id: newCalf.animal_id
				});
			} else {
				await createReproductionRecord(reproductionPayload);
			}

			history.back();
		} finally {
			saving = false;
		}
	}
</script>

{#if !loaded}
	<div class="flex h-48 items-center justify-center text-gray-500">Cargando...</div>
{:else}
	<form onsubmit={handleSubmit} class="space-y-4">
		<div class="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
			<button
				type="button"
				onclick={() => switchMode('monta')}
				disabled={modeLocked}
				class="rounded-lg py-3 text-sm font-semibold transition-all disabled:cursor-default disabled:opacity-100 {mode ===
				'monta'
					? 'bg-white text-pink-700 shadow-sm'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				🐂 Monta
			</button>
			<button
				type="button"
				onclick={() => switchMode('parto')}
				disabled={modeLocked}
				class="rounded-lg py-3 text-sm font-semibold transition-all disabled:cursor-default disabled:opacity-100 {mode ===
				'parto'
					? 'bg-white text-pink-700 shadow-sm'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				🐄 Parto
			</button>
		</div>

		{#if showCalfCreation}
			<div class="space-y-3 rounded-xl border border-pink-200 bg-pink-50 p-4">
				<p class="text-sm font-semibold text-pink-700">🐮 Datos de la cría (nuevo animal)</p>
				<FormField
					label="Nombre de la cría"
					name="calf_nombre"
					value={calf.nombre}
					onchange={(value) => (calf.nombre = value)}
					placeholder="Ej: Lucero"
					required
				/>
				<div class="grid grid-cols-2 gap-3">
					<FormField
						label="No. Arete (opcional)"
						name="calf_arete"
						value={calf.arete_id}
						onchange={(value) => (calf.arete_id = value)}
						placeholder="Ej: A099"
					/>
					<SelectField
						label="Sexo"
						name="calf_sexo"
						value={calf.sexo}
						onchange={(value) => (calf.sexo = value as 'Macho' | 'Hembra')}
						options={[...SEXOS]}
						required
					/>
				</div>
				<FormField
					label="Raza"
					name="calf_raza"
					value={calf.raza}
					onchange={(value) => (calf.raza = value)}
					placeholder="Ej: Brahman (hereda de la madre)"
				/>
				<FormField
					label="Peso al nacer (kg, opcional)"
					name="calf_peso"
					type="number"
					value={calf.peso_nacimiento}
					onchange={(value) => (calf.peso_nacimiento = value)}
					placeholder="Ej: 35"
				/>
			</div>
		{:else if mode === 'parto'}
			<SelectField
				label="Cría registrada"
				name="cria_id"
				value={form.cria_id}
				onchange={(value) => (form.cria_id = value)}
				options={allAnimalOptions}
				placeholder="Seleccionar cría..."
				disabled={readonly}
			/>
		{/if}

		<SelectField
			label="Vaca"
			name="vaca_id"
			value={form.vaca_id}
			onchange={(value) => (form.vaca_id = value)}
			options={cows}
			required
			disabled={readonly}
		/>

		<SelectField
			label="Semental"
			name="semental_id"
			value={form.semental_id}
			onchange={(value) => (form.semental_id = value)}
			options={bullOptions}
			required
			disabled={readonly}
		/>

		{#if isExternalBull}
			<div class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
				<Info size={16} class="mt-0.5 shrink-0 text-amber-600" />
				<span class="text-sm text-amber-800">
					Anota el nombre del semental en el campo <strong>Notas</strong> al final del formulario.
				</span>
			</div>
		{/if}

		<FormField
			label="Fecha de monta observada"
			name="fecha_monta"
			type="date"
			value={form.fecha_monta}
			onchange={(value) => {
				userEditedMonta = true;
				form.fecha_monta = value;
			}}
			disabled={readonly}
		/>

		{#if mode === 'monta' && fechaPosibleParto}
			<div class="rounded-lg bg-pink-50 px-4 py-3">
				<span class="text-sm text-pink-700">
					Posible parto: <strong>{fechaPosibleParto}</strong> (~{GESTATION_DAYS} días)
				</span>
			</div>
		{/if}

		<FormField
			label="Fecha de parto real"
			name="fecha_parto_real"
			type="date"
			value={form.fecha_parto_real}
			onchange={(value) => {
				userEditedParto = true;
				form.fecha_parto_real = value;
			}}
			disabled={readonly}
		/>

		{#if mode === 'parto' && form.fecha_parto_real}
			<div class="rounded-lg bg-blue-50 px-4 py-3">
				<span class="text-sm text-blue-700">
					Fecha de monta estimada calculada basada en el ciclo gestacional de {GESTATION_DAYS}
					días.
				</span>
			</div>
		{/if}

		{#if mode === 'monta'}
			<SelectField
				label="Preñez confirmada"
				name="prenez_confirmada"
				value={form.prenez_confirmada}
				onchange={(value) => (form.prenez_confirmada = value)}
				options={PRENEZ_OPTIONS}
				disabled={readonly}
			/>
			<SelectField
				label="Cría (si ya nació)"
				name="cria_id"
				value={form.cria_id}
				onchange={(value) => (form.cria_id = value)}
				options={allAnimalOptions}
				placeholder="Seleccionar cría..."
				disabled={readonly}
			/>
			<FormField
				label="Peso al destete de la cría (kg)"
				name="peso_destete_cria"
				type="number"
				value={form.peso_destete_cria}
				onchange={(value) => (form.peso_destete_cria = value)}
				placeholder="Ej: 180"
				disabled={readonly}
			/>
		{/if}

		<FormField
			label="Notas"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(value) => (form.notas = value)}
			placeholder={isExternalBull
				? 'Nombre del semental externo y observaciones...'
				: 'Observaciones...'}
			disabled={readonly}
		/>

		{#if !readonly}
			<button
				type="submit"
				disabled={saving || !canSubmit}
				class="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-pink-700 disabled:opacity-50"
			>
				<Save size={20} />
				{saving ? 'Guardando...' : 'Guardar registro'}
			</button>
		{/if}
	</form>
{/if}