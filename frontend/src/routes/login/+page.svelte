<script lang="ts">
	import { replaceWith } from '$lib/navigation.svelte';
	import { login } from '$lib/api';

	let token = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!token.trim()) return;

		loading = true;
		error = '';

		try {
			const ok = await login(token.trim());
			if (ok) {
				replaceWith('/');
			} else {
				error = 'Token inválido. Intenta de nuevo.';
			}
		} catch {
			error = 'Error de conexión. Verifica tu internet.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-green-700">🐄 Registro Ganadero</h1>
			<p class="mt-2 text-sm text-gray-500">Ingresa tu token de acceso</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="token" class="block text-sm font-medium text-gray-700">Token</label>
				<input
					id="token"
					type="password"
					bind:value={token}
					placeholder="Tu token de acceso"
					required
					class="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
				/>
			</div>

			{#if error}
				<p class="text-sm text-red-600">{error}</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-green-700 py-3 text-base font-semibold text-white transition-colors hover:bg-green-600 disabled:opacity-50"
			>
				{loading ? 'Verificando...' : 'Ingresar'}
			</button>
		</form>
	</div>
</div>
