<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { Plus, DollarSign } from 'lucide-svelte';
	import { format } from 'date-fns';
	import { es } from 'date-fns/locale';
	import { formatStoredDate } from '$lib/date';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ZoomablePhoto from '$lib/components/ZoomablePhoto.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sales = $derived(data.sales);
	const animalMap = $derived(data.animalMap);
	const photoMap = $derived(data.photoMap);

	let totalRevenue = $derived(sales.reduce((s, v) => s + (v.precio_total ?? 0), 0));
	let totalWeight = $derived(sales.reduce((s, v) => s + (v.peso ?? 0), 0));
	let avgPriceKg = $derived(totalWeight > 0 ? (totalRevenue / totalWeight).toFixed(2) : '0');

	onMount(() => {
		const handler = () => invalidateAll();
		window.addEventListener('sync-complete', handler);
		return () => window.removeEventListener('sync-complete', handler);
	});

	function formatDate(dateStr: string): string {
		if (!dateStr) return '';
		try {
			return formatStoredDate(dateStr, 'd MMM yyyy', es);
		} catch {
			return dateStr;
		}
	}
</script>

<div class="mx-auto max-w-lg space-y-4">
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold text-gray-800">Ventas</h2>
		<a
			href="/ventas/nuevo"
			class="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
		>
			<Plus size={18} />
			Nueva venta
		</a>
	</div>

	{#if sales.length > 0}
		<div class="grid grid-cols-3 gap-2">
			<Card class="text-center">
				<p class="text-lg font-bold text-green-700">${totalRevenue.toLocaleString()}</p>
				<p class="text-xs text-gray-500">Ingresos totales</p>
			</Card>
			<Card class="text-center">
				<p class="text-lg font-bold text-amber-700">{sales.length}</p>
				<p class="text-xs text-gray-500">Ventas</p>
			</Card>
			<Card class="text-center">
				<p class="text-lg font-bold text-blue-700">${avgPriceKg}</p>
				<p class="text-xs text-gray-500">Prom. $/kg</p>
			</Card>
		</div>

		<div class="space-y-2">
			{#each sales as sale (sale.venta_id)}
				{@const photoSrc = photoMap.get(sale.animal_id)}
				{@const animalName = animalMap.get(sale.animal_id) ?? sale.animal_id}
				<Card class="flex items-center gap-3" onclick={() => goto(`/ganado/${sale.animal_id}`)}>
					{#if photoSrc}
						<ZoomablePhoto
							src={photoSrc}
							alt={animalName}
							imgClass="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-amber-200"
						/>
					{:else}
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700"
						>
							{animalName?.charAt(0)?.toUpperCase() ?? '?'}
						</div>
					{/if}
					<div class="min-w-0 flex-1">
						<div class="flex items-center justify-between">
							<span class="font-semibold text-gray-800">{animalName}</span>
							<span class="font-bold text-green-700">
								${sale.precio_total?.toLocaleString() ?? '—'}
							</span>
						</div>
						<div class="flex gap-3 text-xs text-gray-500">
							<span>{formatDate(sale.fecha_venta)}</span>
							<span>{sale.motivo_venta}</span>
							{#if sale.peso}
								<span>{sale.peso} kg</span>
							{/if}
							{#if sale.comprador}
								<span>{sale.comprador}</span>
							{/if}
						</div>
					</div>
				</Card>
			{/each}
		</div>
	{:else}
		<EmptyState title="Sin ventas registradas" description="Las ventas de ganado aparecerán aquí.">
			{#snippet icon()}
				<DollarSign size={56} />
			{/snippet}
			{#snippet action()}
				<a
					href="/ventas/nuevo"
					class="rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white shadow-sm"
				>
					Registrar venta
				</a>
			{/snippet}
		</EmptyState>
	{/if}
</div>
