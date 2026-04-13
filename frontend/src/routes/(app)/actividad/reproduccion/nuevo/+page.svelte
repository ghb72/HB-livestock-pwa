<script lang="ts">
	import { page } from '$app/state';
	import { ArrowLeft, Save, Info } from 'lucide-svelte';
	import { addDays, subDays, format } from 'date-fns';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { db } from '$lib/db';
	import { createReproductionRecord, createAnimal } from '$lib/store';
	import type { PrenezEstado } from '$lib/types';

	const PRENEZ_OPTIONS: PrenezEstado[] = ['Pendiente', 'Sí', 'No'];
	const SEXOS = ['Macho', 'Hembra'] as const;
	const GESTATION_DAYS = 283;

	type EventMode = 'monta' | 'parto';

	const todayStr = () => new Date().toISOString().split('T')[0];
	const gestationAgo = () => format(subDays(new Date(), GESTATION_DAYS), 'yyyy-MM-dd');

	const preselected = page.url.searchParams.get('animal') ?? '';

	let saving = $state(false);
	let mode = $state<EventMode>('monta');
	let userEditedMonta = $state(false);
	let userEditedParto = $state(false);

	let cows = $state<string[]>([]);
	let bullOptions = $state<string[]>([]);
	let allAnimalOptions = $state<string[]>([]);

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
			? format(addDays(new Date(form.fecha_monta), GESTATION_DAYS), 'yyyy-MM-dd')
			: ''
	);

	let isExternalBull = $derived(form.semental_id === 'Toro externo (ver notas)');

	let canSubmit = $derived(
		!!form.vaca_id &&
			!!form.semental_id &&
			(mode === 'monta' || (!!calf.nombre && !!calf.sexo))
	);

	$effect(() => {
		loadAnimals();
	});

	async function loadAnimals() {
		const all = await db.animals.where('deleted').equals(0).toArray();
		cows = all
			.filter((a) => a.sexo === 'Hembra')
			.map((a) => `${a.animal_id} - ${a.nombre}`);
		bullOptions = [
			...all.filter((a) => a.sexo === 'Macho').map((a) => `${a.animal_id} - ${a.nombre}`),
			'Toro externo (ver notas)'
		];
		allAnimalOptions = all.map((a) => `${a.animal_id} - ${a.nombre}`);

		if (preselected && !form.vaca_id.includes(' - ')) {
			const match = cows.find((c) => c.startsWith(preselected));
			if (match) form.vaca_id = match;
		}
	}

	function switchMode(newMode: EventMode) {
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

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;

		try {
			const vacaIdRaw = form.vaca_id.split(' - ')[0] ?? form.vaca_id;
			const sementalIdRaw = isExternalBull
				? 'EXTERNO'
				: (form.semental_id.split(' - ')[0] ?? form.semental_id);

			if (mode === 'parto') {
				const allAnimals = await db.animals.where('deleted').equals(0).toArray();
				const motherAnimal = allAnimals.find((a) => a.animal_id === vacaIdRaw);
				const calfRaza = calf.raza || motherAnimal?.raza || '';

				const newCalf = await createAnimal({
					arete_id: calf.arete_id,
					nombre: calf.nombre,
					tipo: 'Becerro(a)',
					sexo: calf.sexo,
					fecha_nacimiento: form.fecha_parto_real || todayStr(),
					raza: calfRaza,
					madre_id: vacaIdRaw,
					padre_id: sementalIdRaw,
					temperamento: 'Normal',
					estado: 'Vivo(a)',
					peso_actual: calf.peso_nacimiento ? Number(calf.peso_nacimiento) : null,
					notas: '',
					foto_url: ''
				});

				await createReproductionRecord({
					vaca_id: vacaIdRaw,
					semental_id: sementalIdRaw,
					fecha_monta: form.fecha_monta,
					fecha_posible_parto: fechaPosibleParto,
					prenez_confirmada: 'Sí',
					fecha_parto_real: form.fecha_parto_real,
					cria_id: newCalf.animal_id,
					peso_destete_cria: form.peso_destete_cria ? Number(form.peso_destete_cria) : null,
					notas: form.notas
				});
			} else {
				await createReproductionRecord({
					vaca_id: vacaIdRaw,
					semental_id: sementalIdRaw,
					fecha_monta: form.fecha_monta,
					fecha_posible_parto: fechaPosibleParto,
					prenez_confirmada: form.prenez_confirmada as PrenezEstado,
					fecha_parto_real: form.fecha_parto_real,
					cria_id: form.cria_id.split(' - ')[0] ?? '',
					peso_destete_cria: form.peso_destete_cria ? Number(form.peso_destete_cria) : null,
					notas: form.notas
				});
			}

			history.back();
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center gap-3">
		<button
			onclick={() => history.back()}
			class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
			aria-label="Volver"
		>
			<ArrowLeft size={24} />
		</button>
		<h2 class="text-xl font-bold text-gray-800">Parto/Monta</h2>
	</div>

	<!-- Mode selector -->
	<div class="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
		<button
			type="button"
			onclick={() => switchMode('monta')}
			class="rounded-lg py-3 text-sm font-semibold transition-all {mode === 'monta'
				? 'bg-white text-pink-700 shadow-sm'
				: 'text-gray-500 hover:text-gray-700'}"
		>
			🐂 Monta
		</button>
		<button
			type="button"
			onclick={() => switchMode('parto')}
			class="rounded-lg py-3 text-sm font-semibold transition-all {mode === 'parto'
				? 'bg-white text-pink-700 shadow-sm'
				: 'text-gray-500 hover:text-gray-700'}"
		>
			🐄 Parto
		</button>
	</div>

	<form onsubmit={handleSubmit} class="space-y-4">
		<!-- Calf mini-form (parto only) -->
		{#if mode === 'parto'}
			<div class="space-y-3 rounded-xl border border-pink-200 bg-pink-50 p-4">
				<p class="text-sm font-semibold text-pink-700">🐮 Datos de la cría (nuevo animal)</p>
				<FormField
					label="Nombre de la cría"
					name="calf_nombre"
					value={calf.nombre}
					onchange={(v) => (calf.nombre = v)}
					placeholder="Ej: Lucero"
					required
				/>
				<div class="grid grid-cols-2 gap-3">
					<FormField
						label="No. Arete (opcional)"
						name="calf_arete"
						value={calf.arete_id}
						onchange={(v) => (calf.arete_id = v)}
						placeholder="Ej: A099"
					/>
					<SelectField
						label="Sexo"
						name="calf_sexo"
						value={calf.sexo}
						onchange={(v) => (calf.sexo = v as 'Macho' | 'Hembra')}
						options={[...SEXOS]}
						required
					/>
				</div>
				<FormField
					label="Raza"
					name="calf_raza"
					value={calf.raza}
					onchange={(v) => (calf.raza = v)}
					placeholder="Ej: Brahman (hereda de la madre)"
				/>
				<FormField
					label="Peso al nacer (kg, opcional)"
					name="calf_peso"
					type="number"
					value={calf.peso_nacimiento}
					onchange={(v) => (calf.peso_nacimiento = v)}
					placeholder="Ej: 35"
				/>
			</div>
		{/if}

		<SelectField
			label="Vaca"
			name="vaca_id"
			value={form.vaca_id}
			onchange={(v) => (form.vaca_id = v)}
			options={cows}
			required
		/>

		<SelectField
			label="Semental"
			name="semental_id"
			value={form.semental_id}
			onchange={(v) => (form.semental_id = v)}
			options={bullOptions}
			required
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
			onchange={(v) => {
				userEditedMonta = true;
				form.fecha_monta = v;
			}}
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
			onchange={(v) => {
				userEditedParto = true;
				form.fecha_parto_real = v;
			}}
		/>

		{#if mode === 'parto' && form.fecha_parto_real}
			<div class="rounded-lg bg-blue-50 px-4 py-3">
				<span class="text-sm text-blue-700">
					Fecha de monta estimada calculada basada en el ciclo gestacional de {GESTATION_DAYS} días.
				</span>
			</div>
		{/if}

		{#if mode === 'monta'}
			<SelectField
				label="Preñez confirmada"
				name="prenez_confirmada"
				value={form.prenez_confirmada}
				onchange={(v) => (form.prenez_confirmada = v)}
				options={PRENEZ_OPTIONS}
			/>
			<SelectField
				label="Cría (si ya nació)"
				name="cria_id"
				value={form.cria_id}
				onchange={(v) => (form.cria_id = v)}
				options={allAnimalOptions}
				placeholder="Seleccionar cría..."
			/>
			<FormField
				label="Peso al destete de la cría (kg)"
				name="peso_destete_cria"
				type="number"
				value={form.peso_destete_cria}
				onchange={(v) => (form.peso_destete_cria = v)}
				placeholder="Ej: 180"
			/>
		{/if}

		<FormField
			label="Notas"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(v) => (form.notas = v)}
			placeholder={isExternalBull
				? 'Nombre del semental externo y observaciones...'
				: 'Observaciones...'}
		/>

		<button
			type="submit"
			disabled={saving || !canSubmit}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-pink-700 disabled:opacity-50"
		>
			<Save size={20} />
			{saving ? 'Guardando...' : 'Guardar registro'}
		</button>
	</form>
</div>
