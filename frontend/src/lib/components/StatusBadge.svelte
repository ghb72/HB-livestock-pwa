<script lang="ts">
	import type { EstadoAnimal } from '$lib/types';

	interface Props {
		estado: EstadoAnimal;
	}

	let { estado }: Props = $props();

	const styles: Record<EstadoAnimal, string> = {
		'Vivo(a)': 'bg-green-100 text-green-800',
		'Muerto(a)': 'bg-red-100 text-red-800',
		'Vendido(a)': 'bg-amber-100 text-amber-800'
	};
</script>

<span
	class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {styles[
		estado
	]}"
>
	{estado}
</span>
