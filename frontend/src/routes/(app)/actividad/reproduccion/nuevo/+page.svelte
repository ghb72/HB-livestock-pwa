<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import ReproductionForm from '$lib/components/ReproductionForm.svelte';
</script>

<div class="mx-auto max-w-lg">
	<div class="mb-4 flex items-center gap-3">
		<BackButton fallback="/actividad" />
		<h2 class="text-xl font-bold text-gray-800">Parto/Monta</h2>
	</div>

	<ReproductionForm />
</div>
