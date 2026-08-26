<script lang="ts">
	import { goBack } from '$lib/navigation.svelte';
	import { page } from '$app/state';
	import { Save } from 'lucide-svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { db } from '$lib/db';
	import { todayLocalDate } from '$lib/date';
	import { createObservation } from '$lib/store';

	const preselected = page.url.searchParams.get('animal') ?? '';

	let saving = $state(false);
	let animalOptions = $state<string[]>([]);

	let form = $state({
		animal_id: preselected,
		fecha: todayLocalDate(),
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
			await createObservation({
				animal_id: form.animal_id.split(' - ')[0],
				fecha: form.fecha,
				notas: form.notas
			});
			goBack('/actividad');
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center gap-3">
		<BackButton fallback="/actividad" />
		<h2 class="text-xl font-bold text-gray-800">Observación</h2>
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
		<FormField
			label="Notas de observación"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(v) => (form.notas = v)}
			placeholder="Describe lo que observaste..."
			required
		/>
		<button
			type="submit"
			disabled={saving || !form.animal_id || !form.notas}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-purple-700 disabled:opacity-50"
		>
			<Save size={20} />
			{saving ? 'Guardando...' : 'Guardar observación'}
		</button>
	</form>
</div>
