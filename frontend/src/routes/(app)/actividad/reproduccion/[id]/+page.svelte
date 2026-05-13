<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Edit, Trash2 } from 'lucide-svelte';
	import { deleteReproductionRecord } from '$lib/store';
	import ReproductionForm from '$lib/components/ReproductionForm.svelte';

	const reproductionId = $derived(page.params.id);

	async function handleDelete() {
		if (!reproductionId || !confirm('¿Estás seguro de eliminar este registro de reproducción?')) {
			return;
		}

		await deleteReproductionRecord(reproductionId);
		goto('/actividad', { replaceState: true });
	}
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<button
				onclick={() => goto('/actividad')}
				class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
				aria-label="Volver"
			>
				<ArrowLeft size={24} />
			</button>
			<h2 class="text-xl font-bold text-gray-800">Detalle de reproducción</h2>
		</div>
		<div class="flex gap-2">
			<a
				href="/actividad/reproduccion/{reproductionId}/editar"
				class="rounded-full bg-pink-100 p-2.5 text-pink-700 hover:bg-pink-200"
				aria-label="Editar"
			>
				<Edit size={18} />
			</a>
			<button
				type="button"
				onclick={handleDelete}
				class="rounded-full bg-red-100 p-2.5 text-red-700 hover:bg-red-200"
				aria-label="Eliminar"
			>
				<Trash2 size={18} />
			</button>
		</div>
	</div>

	<ReproductionForm reproductionId={reproductionId} readonly />
</div>