<script lang="ts">
	import { Beef, HeartPulse, Baby, DollarSign, Plus, MapPin } from 'lucide-svelte';
	import Card from '$lib/components/Card.svelte';
	import { db } from '$lib/db';

	let totalAnimals = $state(0);
	let aliveAnimals = $state(0);
	let healthEvents = $state(0);
	let reproEvents = $state(0);
	let salesCount = $state(0);

	async function loadStats() {
		totalAnimals = await db.animals.where('deleted').equals(0).count();
		aliveAnimals = await db.animals
			.where('estado')
			.equals('Vivo(a)')
			.filter((a) => a.deleted === 0)
			.count();
		healthEvents = await db.health.where('deleted').equals(0).count();
		reproEvents = await db.reproduction.where('deleted').equals(0).count();
		salesCount = await db.sales.where('deleted').equals(0).count();
	}

	$effect(() => {
		loadStats();
		const handler = () => loadStats();
		window.addEventListener('sync-complete', handler);
		return () => window.removeEventListener('sync-complete', handler);
	});

	const stats = $derived([
		{
			label: 'Animales vivos',
			value: aliveAnimals,
			total: totalAnimals,
			icon: Beef,
			color: 'text-green-600 bg-green-100'
		},
		{
			label: 'Eventos de salud',
			value: healthEvents,
			total: undefined,
			icon: HeartPulse,
			color: 'text-blue-600 bg-blue-100'
		},
		{
			label: 'Reproducción',
			value: reproEvents,
			total: undefined,
			icon: Baby,
			color: 'text-pink-600 bg-pink-100'
		},
		{
			label: 'Ventas',
			value: salesCount,
			total: undefined,
			icon: DollarSign,
			color: 'text-amber-600 bg-amber-100'
		}
	]);
</script>

<div class="mx-auto max-w-lg space-y-6 p-4">
	<div>
		<h2 class="text-2xl font-bold text-gray-800">Bienvenido</h2>
		<p class="text-sm text-gray-500">Resumen de tu rancho</p>
	</div>

	<div class="grid grid-cols-2 gap-3">
		{#each stats as { label, value, total, icon: Icon, color }}
			<Card>
				<div class="flex items-center gap-3">
					<div class="rounded-xl p-2.5 {color}">
						<Icon size={22} />
					</div>
					<div>
						<p class="text-xl font-bold text-gray-800">
							{value}
							{#if total !== undefined}
								<span class="text-sm font-normal text-gray-400">/{total}</span>
							{/if}
						</p>
						<p class="text-xs text-gray-500">{label}</p>
					</div>
				</div>
			</Card>
		{/each}
	</div>

	<div>
		<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
			Acciones rápidas
		</h3>
		<div class="space-y-3">
			<a
				href="/actividad/recorrido/nuevo"
				class="flex items-center gap-3 rounded-xl bg-green-700 px-4 py-4 text-white shadow-md transition-colors active:bg-green-800"
			>
				<MapPin size={22} />
				<div>
					<span class="text-lg font-bold">Iniciar recorrido</span>
					<p class="text-xs text-green-200">Registra los animales que observes en campo</p>
				</div>
			</a>

			<div class="grid grid-cols-2 gap-3">
				<a
					href="/ganado/nuevo"
					class="flex items-center gap-3 rounded-xl bg-green-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-green-700"
				>
					<Plus size={20} />
					<span class="font-semibold">Registrar animal</span>
				</a>
				<a
					href="/actividad/salud/nuevo"
					class="flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-blue-700"
				>
					<HeartPulse size={20} />
					<span class="font-semibold">Evento de salud</span>
				</a>
				<a
					href="/actividad/reproduccion/nuevo"
					class="flex items-center gap-3 rounded-xl bg-pink-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-pink-700"
				>
					<Baby size={20} />
					<span class="font-semibold">Monta / Parto</span>
				</a>
				<a
					href="/ventas/nuevo"
					class="flex items-center gap-3 rounded-xl bg-amber-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-amber-700"
				>
					<DollarSign size={20} />
					<span class="font-semibold">Registrar venta</span>
				</a>
			</div>
		</div>
	</div>
</div>
