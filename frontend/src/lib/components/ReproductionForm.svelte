<script lang="ts">
	import { goBack, replaceWith } from '$lib/navigation.svelte';
	import { page } from '$app/state';
	import { Save, Info, AlertTriangle } from 'lucide-svelte';
	import { addDays, subDays, format } from 'date-fns';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import PhotoCapture from '$lib/components/PhotoCapture.svelte';
	import { db } from '$lib/db';
	import { formatStoredDate, parseStoredDate, todayLocalDate } from '$lib/date';
	import { toAnimalOptions, withSelected, type SelectOption } from '$lib/animalOptions';
	import {
		addPhoto,
		createReproductionRecord,
		createAnimal,
		getReproductionRecord,
		updateReproductionRecord
	} from '$lib/store';
	import {
		checkMontaWarnings,
		checkPartoWarnings,
		GESTATION_DAYS,
		MIN_CALVING_INTERVAL_DAYS,
		POSTPARTUM_WAIT_DAYS,
		type MontaWarning
	} from '$lib/reproduction';
	import type { Animal, AnimalTipo, PrenezEstado, ReproductionRecord } from '$lib/types';

	const PRENEZ_OPTIONS: PrenezEstado[] = ['Pendiente', 'Sí', 'No'];
	const SEXOS = ['Macho', 'Hembra'] as const;
	/** Stored bull id for a mating by a bull that is not in the herd. */
	const EXTERNAL_BULL_VALUE = 'EXTERNO';
	const EXTERNAL_BULL_LABEL = 'Toro externo (ver notas)';
	const BULL_TIPOS: AnimalTipo[] = ['Semental', 'Torete'];

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
	let calfPhoto = $state('');

	// Consistency checks need the whole herd, not just the ones offered as options.
	let allRecords = $state<ReproductionRecord[]>([]);
	let allAnimals = $state<Animal[]>([]);

	// Selectors only offer live animals, but an older record may point at one that has
	// since died or been sold — `withSelected` keeps that animal visible so editing the
	// record does not silently drop the link.
	let cows = $derived(
		withSelected(
			toAnimalOptions(
				allAnimals.filter((animal) => animal.sexo === 'Hembra' && animal.estado === 'Vivo(a)')
			),
			allAnimals,
			form.vaca_id
		)
	);
	let bullOptions = $derived([
		...withSelected(
			toAnimalOptions(
				allAnimals.filter(
					(animal) => BULL_TIPOS.includes(animal.tipo) && animal.estado === 'Vivo(a)'
				)
			),
			allAnimals,
			form.semental_id === EXTERNAL_BULL_VALUE ? '' : form.semental_id
		),
		{ value: EXTERNAL_BULL_VALUE, label: EXTERNAL_BULL_LABEL }
	]);
	let allAnimalOptions = $derived(
		withSelected(
			toAnimalOptions(allAnimals.filter((animal) => animal.estado === 'Vivo(a)')),
			allAnimals,
			form.cria_id
		)
	);

	/** Editable note written onto the confirmation this monta withdraws. */
	let revocationNoteDraft = $state('');
	let revocationNoteTouched = $state(false);

	let fechaPosibleParto = $derived(
		form.fecha_monta
			? format(addDays(parseStoredDate(form.fecha_monta) ?? new Date(form.fecha_monta), GESTATION_DAYS), 'yyyy-MM-dd')
			: ''
	);

	// Physically impossible situations for the mating being entered. They advise,
	// never block: an abortion, an unrecorded birth or a mistyped date all produce
	// a real event the user still has to be able to save.
	let montaWarnings = $derived.by((): MontaWarning[] => {
		if (readonly || mode !== 'monta' || !form.vaca_id || !form.fecha_monta) return [];
		return checkMontaWarnings(
			form.vaca_id,
			form.fecha_monta,
			allRecords,
			allAnimals,
			reproductionId ?? ''
		);
	});

	let standingPrenez = $derived(
		montaWarnings.find((w) => w.kind === 'prenez-vigente') as
			| Extract<MontaWarning, { kind: 'prenez-vigente' }>
			| undefined
	);
	let recentBirthWarning = $derived(
		montaWarnings.find((w) => w.kind === 'recien-parida') as
			| Extract<MontaWarning, { kind: 'recien-parida' }>
			| undefined
	);

	// Same idea on the calving side: two calvings closer than a waiting period
	// plus a gestation cannot both be hers.
	let partoWarning = $derived.by(() => {
		if (readonly || mode !== 'parto' || !form.vaca_id || !form.fecha_parto_real) return undefined;
		return checkPartoWarnings(
			form.vaca_id,
			form.fecha_parto_real,
			allRecords,
			allAnimals,
			reproductionId ?? ''
		)[0];
	});

	// Reset the draft whenever the underlying suggestion changes, unless the user
	// has already written into it.
	$effect(() => {
		const suggested = standingPrenez?.suggestedNote ?? '';
		if (!revocationNoteTouched) revocationNoteDraft = suggested;
	});

	let isExternalBull = $derived(form.semental_id === EXTERNAL_BULL_VALUE);
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

		const [animals, records] = await Promise.all([
			db.animals.where('deleted').equals(0).toArray(),
			db.reproduction.where('deleted').equals(0).toArray()
		]);
		allAnimals = animals;
		allRecords = records;

		if (reproductionId) {
			const record = await getReproductionRecord(reproductionId);
			if (record) {
				loadRecord(record);
			}
		} else {
			resetFormForCreate();
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
		calfPhoto = '';
	}

	function loadRecord(record: ReproductionRecord) {
		mode = record.fecha_parto_real ? 'parto' : 'monta';
		form = {
			vaca_id: record.vaca_id,
			semental_id: record.semental_id,
			fecha_monta: record.fecha_monta,
			prenez_confirmada: record.prenez_confirmada,
			fecha_parto_real: record.fecha_parto_real,
			cria_id: record.cria_id,
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
		calfPhoto = '';
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

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (saving || readonly) return;
		saving = true;

		try {
			const vacaId = form.vaca_id;
			const sementalId = form.semental_id;
			const reproductionPayload = {
				vaca_id: vacaId,
				semental_id: sementalId,
				fecha_monta: form.fecha_monta,
				fecha_posible_parto: fechaPosibleParto,
				prenez_confirmada: mode === 'parto' ? ('Sí' as PrenezEstado) : (form.prenez_confirmada as PrenezEstado),
				fecha_parto_real: mode === 'parto' ? form.fecha_parto_real : '',
				cria_id: form.cria_id,
				peso_destete_cria: form.peso_destete_cria ? Number(form.peso_destete_cria) : null,
				notas: form.notas
			};

			// Saving a mating on a cow already carrying a confirmed pregnancy means
			// that confirmation was wrong — she came back into heat. Withdraw it and
			// record why, using whatever the user wrote into the pre-filled note.
			if (standingPrenez) {
				const previous = standingPrenez.record.notas;
				const reason = revocationNoteDraft.trim() || standingPrenez.suggestedNote;
				await updateReproductionRecord(standingPrenez.record.reproduccion_id, {
					prenez_confirmada: 'No',
					notas: previous ? `${previous}\n${reason}` : reason
				});
			}

			if (reproductionId) {
				await updateReproductionRecord(reproductionId, reproductionPayload);
				replaceWith(`/actividad/reproduccion/${reproductionId}`);
				return;
			}

			if (showCalfCreation) {
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

				if (calfPhoto.startsWith('data:')) {
					await addPhoto(newCalf.animal_id, calfPhoto);
				}

				await createReproductionRecord({
					...reproductionPayload,
					cria_id: newCalf.animal_id
				});
			} else {
				await createReproductionRecord(reproductionPayload);
			}

			goBack('/actividad');
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
				<PhotoCapture value={calfPhoto} onchange={(v) => (calfPhoto = v)} />
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

		{#if recentBirthWarning}
			<div class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
				<AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600" />
				<div class="space-y-1 text-sm text-amber-800">
					<p>
						Esta vaca parió el
						<strong>{formatStoredDate(recentBirthWarning.birthDate, 'dd/MM/yyyy')}</strong>, hace
						{recentBirthWarning.daysPostpartum}
						{recentBirthWarning.daysPostpartum === 1 ? 'día' : 'días'}.
					</p>
					<p class="text-amber-700/90">
						Una monta fértil no es posible antes de los {POSTPARTUM_WAIT_DAYS} días posparto. Revisa
						la fecha, o guarda igualmente si la monta ocurrió así.
					</p>
				</div>
			</div>
		{/if}

		{#if standingPrenez}
			<div class="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
				<div class="flex items-start gap-2">
					<AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600" />
					<div class="space-y-1 text-sm text-amber-800">
						<p>
							Esta vaca tiene una preñez confirmada de la monta del
							<strong>{formatStoredDate(standingPrenez.record.fecha_monta, 'dd/MM/yyyy')}</strong>
							{#if standingPrenez.expectedBirth}
								(parto esperado
								{formatStoredDate(standingPrenez.expectedBirth, 'dd/MM/yyyy')})
							{/if}.
						</p>
						<p class="text-amber-700/90">
							Si guardas esta monta, esa confirmación pasará a <strong>«No»</strong> y se anotará el
							motivo. Amplía la nota si hubo aborto o pérdida.
						</p>
					</div>
				</div>
				<FormField
					label="Nota para el registro anterior"
					name="revocation_note"
					type="textarea"
					value={revocationNoteDraft}
					onchange={(value) => {
						revocationNoteTouched = true;
						revocationNoteDraft = value;
					}}
				/>
			</div>
		{/if}

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

		{#if partoWarning}
			<div class="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
				<AlertTriangle size={16} class="mt-0.5 shrink-0 text-amber-600" />
				<div class="space-y-1 text-sm text-amber-800">
					<p>
						Esta vaca ya parió el
						<strong>{formatStoredDate(partoWarning.previousBirth, 'dd/MM/yyyy')}</strong>, hace
						{partoWarning.daysSincePrevious}
						{partoWarning.daysSincePrevious === 1 ? 'día' : 'días'}.
					</p>
					<p class="text-amber-700/90">
						Entre dos partos deben pasar al menos {MIN_CALVING_INTERVAL_DAYS} días ({POSTPARTUM_WAIT_DAYS}
						de espera posparto más {GESTATION_DAYS} de gestación). Revisa la fecha, o guarda igualmente
						si el parto ocurrió así.
					</p>
				</div>
			</div>
		{/if}

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