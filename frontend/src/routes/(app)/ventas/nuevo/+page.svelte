<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, Save } from 'lucide-svelte';
	import FormField from '$lib/components/FormField.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { db } from '$lib/db';
	import { createSale, updateAnimal } from '$lib/store';
	import type { MotivoVenta } from '$lib/types';

	const MOTIVOS: MotivoVenta[] = [
		'Por peso (destete)',
		'Por edad',
		'Por productividad',
		'Otro'
	];

	const preselected = page.url.searchParams.get('animal') ?? '';

	let saving = $state(false);
	let animalOptions = $state<string[]>([]);

	let form = $state({
		animal_id: preselected,
		fecha_venta: new Date().toISOString().split('T')[0],
		motivo_venta: '' as string,
		peso: '',
		precio_total: '',
		comprador: '',
		notas: ''
	});

	let precioKg = $derived(
		form.peso && form.precio_total
			? (Number(form.precio_total) / Number(form.peso)).toFixed(2)
			: ''
	);

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
			const animalId = form.animal_id.split(' - ')[0];

			await createSale({
				animal_id: animalId,
				fecha_venta: form.fecha_venta,
				motivo_venta: form.motivo_venta as MotivoVenta,
				peso: form.peso ? Number(form.peso) : null,
				precio_total: form.precio_total ? Number(form.precio_total) : null,
				precio_kg: precioKg ? Number(precioKg) : null,
				comprador: form.comprador,
				notas: form.notas
			});

			await updateAnimal(animalId, { estado: 'Vendido(a)' });
			goto('/ventas', { replaceState: true });
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
		<h2 class="text-xl font-bold text-gray-800">Registrar venta</h2>
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
			label="Fecha de venta"
			name="fecha_venta"
			type="date"
			value={form.fecha_venta}
			onchange={(v) => (form.fecha_venta = v)}
			required
		/>
		<SelectField
			label="Motivo de venta"
			name="motivo_venta"
			value={form.motivo_venta}
			onchange={(v) => (form.motivo_venta = v)}
			options={MOTIVOS}
			required
		/>
		<div class="grid grid-cols-2 gap-3">
			<FormField
				label="Peso (kg)"
				name="peso"
				type="number"
				value={form.peso}
				onchange={(v) => (form.peso = v)}
				placeholder="Ej: 450"
			/>
			<FormField
				label="Precio total ($)"
				name="precio_total"
				type="number"
				value={form.precio_total}
				onchange={(v) => (form.precio_total = v)}
				placeholder="Ej: 25000"
			/>
		</div>

		{#if precioKg}
			<div class="rounded-lg bg-amber-50 px-4 py-3">
				<span class="text-sm text-amber-700">
					Precio por kg: <strong>${precioKg} / kg</strong>
				</span>
			</div>
		{/if}

		<FormField
			label="Comprador"
			name="comprador"
			value={form.comprador}
			onchange={(v) => (form.comprador = v)}
			placeholder="Nombre del comprador"
		/>
		<FormField
			label="Notas"
			name="notas"
			type="textarea"
			value={form.notas}
			onchange={(v) => (form.notas = v)}
			placeholder="Detalles de la venta..."
		/>
		<button
			type="submit"
			disabled={saving || !form.animal_id || !form.motivo_venta}
			class="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-amber-700 disabled:opacity-50"
		>
			<Save size={20} />
			{saving ? 'Guardando...' : 'Registrar venta'}
		</button>
	</form>
</div>
