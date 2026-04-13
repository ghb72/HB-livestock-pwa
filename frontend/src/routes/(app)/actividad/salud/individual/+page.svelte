<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, Save } from 'lucide-svelte';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { db } from '$lib/db';
	import { createHealthRecord } from '$lib/store';
	import type { TipoEventoSalud, EstadoGeneral } from '$lib/types';

	const TIPOS_EVENTO: TipoEventoSalud[] = [
		'Vacuna',
		'Desparasitación',
		'Vitamina',
		'Enfermedad',
		'Tratamiento',
		'Revisión'
	];
	const ESTADOS_GENERAL: EstadoGeneral[] = ['Fuerte', 'Flaco', 'Enfermo'];

	const preselected = page.url.searchParams.get('animal') ?? '';

	let saving = $state(false);
	let animalOptions = $state<string[]>([]);

	let form = $state({
		animal_id: preselected,
		fecha: new Date().toISOString().split('T')[0],
		tipo_evento: '' as string,
		producto: '',
		dosis: '',
		estado_general: '' as string,
		proxima_aplicacion: '',
		notas: ''
	});

	$effect(() => {
		loadAnimals();
	});

	async function loadAnimals() {
		const all = await db.animals.where('deleted').equals(0).toArray();
		animalOptions = all.map((a) => `${a.animal_id} - ${a.nombre}`);
		if (preselected && !form.animal_id.includes(' - ')) {
			const match = animalOptions.find((o) => o.startsWith(preselected));
			if (match) form.animal_id = match;
		}
	}

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (saving) return;
		saving = true;
		try {
			await createHealthRecord({
				animal_id: form.animal_id.split(' - ')[0],
				fecha: form.fecha,
				tipo_evento: form.tipo_evento as TipoEventoSalud,
				producto: form.producto,
				dosis: form.dosis,
				estado_general: form.estado_general as EstadoGeneral,
				proxima_aplicacion: form.proxima_aplicacion,
				notas: form.notas
			});
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
		<h2 class="text-xl font-bold text-gray-800">Evento de salud</h2>
	</div>

	<form onsubmit={handleSubmit} class="space-y-4">
		<SelectField
			label="Animal"
			name="animal_id"
			value={form.animal_id}
			onchange={(v) => (form.animal_id = v)}
			options={animalOptions}
			required
		/>
		<FormField
			label="Fecha"
			name="fecha"
			type="date"
			value={form.fecha}
			onchange={(v) => (form.fecha = v)}
			required
		/>
		<SelectField
			label="Tipo de evento"
			name="tipo_evento"
			value={form.tipo_evento}
			onchange={(v) => (form.tipo_evento = v)}
			options={TIPOS_EVENTO}
			required
		/>
		<FormField
			label="Producto / Vacuna / Medicamento"
			name="producto"
			value={form.producto}
			onchange={(v) => (form.producto = v)}
			placeholder="Ej: Ivermectina, Bacteria triple"
		/>
		<FormField
			label="Dosis"
			name="dosis"
			value={form.dosis}
			onchange={(v) => (form.dosis = v)}
			placeholder="Ej: 5 ml"
		/>
		<SelectField
			label="Estado general"
			name="estado_general"
			value={form.estado_general}
			onchange={(v) => (form.estado_general = v)}
			options={ESTADOS_GENERAL}
		/>
		<FormField
			label="Próxima aplicación"
			name="proxima_aplicacion"
			type="date"
			value={form.proxima_aplicacion}
			onchange={(v) => (form.proxima_aplicacion = v)}
		/>
		<FormField
			label="Notas"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(v) => (form.notas = v)}
			placeholder="Observaciones adicionales..."
		/>
		<button
			type="submit"
			disabled={saving || !form.animal_id || !form.tipo_evento}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
		>
			<Save size={20} />
			{saving ? 'Guardando...' : 'Guardar evento'}
		</button>
	</form>
</div>
