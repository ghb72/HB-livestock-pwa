<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ReproductionForm from '$lib/components/ReproductionForm.svelte';

	const reproductionId = $derived(page.params.id);
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center gap-3">
		<BackButton fallback={`/actividad/reproduccion/${reproductionId}`} />
		<h2 class="text-xl font-bold text-gray-800">Editar reproducción</h2>
	</div>

	<ReproductionForm reproductionId={reproductionId} />
</div>