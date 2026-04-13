<script lang="ts">
	import { ArrowLeft, Database, Wifi, WifiOff, Trash2 } from 'lucide-svelte';
	import { db } from '$lib/db';
	import Card from '$lib/components/Card.svelte';

	let online = $state(navigator.onLine);

	let animalCount = $state(0);
	let healthCount = $state(0);
	let reproCount = $state(0);
	let obsCount = $state(0);
	let salesCount = $state(0);
	let pendingCount = $state(0);

	$effect(() => {
		const handleOnline = () => (online = true);
		const handleOffline = () => (online = false);
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	$effect(() => {
		loadCounts();
	});

	async function loadCounts() {
		const [a, h, r, o, s] = await Promise.all([
			db.animals.count(),
			db.health.count(),
			db.reproduction.count(),
			db.observations.count(),
			db.sales.count()
		]);
		animalCount = a;
		healthCount = h;
		reproCount = r;
		obsCount = o;
		salesCount = s;

		let pending = 0;
		const tables = [db.animals, db.health, db.reproduction, db.observations, db.sales];
		for (const table of tables) {
			pending += await table.where('synced').equals(0).count();
		}
		pendingCount = pending;
	}

	async function handleClearData() {
		if (
			!confirm(
				'⚠️ ¿Estás seguro? Esto eliminará TODOS los datos locales. Esta acción no se puede deshacer.'
			)
		)
			return;

		await db.delete();
		window.location.reload();
	}
</script>

<div class="mx-auto max-w-lg space-y-4">
	<div class="flex items-center gap-3">
		<button
			onclick={() => history.back()}
			class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
			aria-label="Volver"
		>
			<ArrowLeft size={24} />
		</button>
		<h2 class="text-xl font-bold text-gray-800">Ajustes</h2>
	</div>

	<!-- Connection status -->
	<Card class="flex items-center gap-3">
		{#if online}
			<Wifi size={24} class="text-green-600" />
		{:else}
			<WifiOff size={24} class="text-red-500" />
		{/if}
		<div>
			<p class="font-semibold text-gray-800">
				{online ? 'Conectado' : 'Sin conexión'}
			</p>
			<p class="text-sm text-gray-500">
				{online ? 'Puedes sincronizar tus datos' : 'Los datos se guardan localmente'}
			</p>
		</div>
	</Card>

	<!-- Data stats -->
	<Card>
		<div class="mb-3 flex items-center gap-2">
			<Database size={20} class="text-gray-500" />
			<h3 class="font-semibold text-gray-800">Datos locales</h3>
		</div>
		<div class="space-y-2 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-gray-600">Animales</span>
				<span class="font-semibold text-gray-800">{animalCount}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-gray-600">Eventos de salud</span>
				<span class="font-semibold text-gray-800">{healthCount}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-gray-600">Reproducción</span>
				<span class="font-semibold text-gray-800">{reproCount}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-gray-600">Observaciones</span>
				<span class="font-semibold text-gray-800">{obsCount}</span>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-gray-600">Ventas</span>
				<span class="font-semibold text-gray-800">{salesCount}</span>
			</div>
			<div class="border-t pt-2">
				<div class="flex items-center justify-between">
					<span class="text-gray-600">Pendientes de sincronizar</span>
					<span
						class="font-semibold {pendingCount > 0 ? 'text-amber-600' : 'text-gray-800'}"
					>
						{pendingCount}
					</span>
				</div>
			</div>
		</div>
	</Card>

	<!-- Danger zone -->
	<Card class="border-red-200">
		<h3 class="mb-2 font-semibold text-red-700">Zona de peligro</h3>
		<p class="mb-3 text-sm text-gray-500">
			Eliminar todos los datos locales del dispositivo.
		</p>
		<button
			onclick={handleClearData}
			class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors active:bg-red-700"
		>
			<Trash2 size={16} />
			Borrar todos los datos
		</button>
	</Card>

	<!-- App info -->
	<div class="text-center text-xs text-gray-400">
		<p>Registro Ganadero v1.0.0</p>
		<p>Datos almacenados en IndexedDB (offline)</p>
	</div>
</div>
