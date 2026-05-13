<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import ReproductionForm from '$lib/components/ReproductionForm.svelte';
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

	<ReproductionForm />
</div>
