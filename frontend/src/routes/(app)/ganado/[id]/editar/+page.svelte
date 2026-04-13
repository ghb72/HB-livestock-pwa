<script lang="ts">
	import { page } from '$app/state';
	import AnimalForm from '$lib/components/AnimalForm.svelte';

	const animalId = $derived(page.params.id);
</script>

<AnimalForm {animalId} />
