<script lang="ts">
	import { page } from '$app/state';
	import RecorridoForm from '$lib/components/RecorridoForm.svelte';

	const recorridoId = $derived(page.params.id);
</script>

<RecorridoForm {recorridoId} />