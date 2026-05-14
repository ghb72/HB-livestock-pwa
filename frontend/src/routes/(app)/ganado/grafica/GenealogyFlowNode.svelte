<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import type { NodeProps } from '@xyflow/svelte';
	import type { FlowNodeData } from '$lib/genealogy';
	import { formatTagId } from '$lib/helpers';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';

	// NodeProps sin genérico → data: Record<string, unknown>; cast a FlowNodeData con $derived
	const { id, data: rawData }: NodeProps = $props();
	const data: FlowNodeData = $derived(rawData as unknown as FlowNodeData);

	function ringColor(estado: FlowNodeData['estado'], isFocus: boolean) {
		if (isFocus) return 'ring-pink-500';
		if (estado === 'Vivo(a)') return 'ring-green-400';
		if (estado === 'Muerto(a)') return 'ring-red-400';
		return 'ring-amber-400';
	}

	function bgStyle(estado: FlowNodeData['estado'], isFocus: boolean) {
		if (isFocus) return 'border-pink-300 bg-gradient-to-br from-pink-50 to-rose-50';
		if (estado === 'Muerto(a)') return 'border-red-200 bg-red-50/60';
		if (estado === 'Vendido(a)') return 'border-amber-200 bg-amber-50/60';
		return 'border-gray-200 bg-white';
	}

	function handleNodeKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		data.onCenter(id);
	}
</script>

<!-- Entrada -->
<Handle type="target" position={Position.Top} class="!w-2 !h-2 !bg-pink-400 !border-white !border" />

<div
	role="button"
	tabindex="0"
	aria-label={`Centrar en ${data.nombre}`}
	onclick={() => data.onCenter(id)}
	onkeydown={handleNodeKeydown}
	class="flex w-full h-full flex-col rounded-2xl border p-3 ring-2 shadow-sm
		cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink-200
		{ringColor(data.estado, data.isFocus)} {bgStyle(data.estado, data.isFocus)}"
>
	<!-- Fila superior: foto + info -->
	<div class="flex items-start gap-3 min-h-0 flex-1">
		{#if data.photoSrc}
			<ZoomablePhoto
				src={data.photoSrc}
				alt={data.nombre}
				imgClass="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
			/>
		{:else}
			<div
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-base font-bold text-gray-500 shadow-inner"
			>
				{data.nombre?.charAt(0)?.toUpperCase() ?? '?'}
			</div>
		{/if}

		<div class="min-w-0 flex-1 pt-0.5">
			<p class="truncate text-sm font-bold leading-tight text-gray-800">{data.nombre}</p>
			<p class="mt-0.5 truncate text-xs text-gray-500">{formatTagId(data.areteId) || '—'}</p>
			<p class="mt-0.5 truncate text-xs text-gray-400">{data.tipo}</p>
		</div>
	</div>

	<!-- Botones de acción -->
	<div class="mt-2 flex gap-2">
		<button
			type="button"
			onclick={(event) => {
				event.stopPropagation();
				data.onCenter(id);
			}}
			class="flex-1 rounded-full bg-gray-100 py-1.5 text-center text-[11px] font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
		>
			Centrar
		</button>
		<button
			type="button"
			onclick={(event) => {
				event.stopPropagation();
				data.onFicha(id);
			}}
			class="flex-1 rounded-full bg-green-50 py-1.5 text-center text-[11px] font-semibold text-green-700 hover:bg-green-100 transition-colors"
		>
			Ficha
		</button>
	</div>
</div>

<!-- Salida -->
<Handle type="source" position={Position.Bottom} class="!w-2 !h-2 !bg-pink-400 !border-white !border" />
