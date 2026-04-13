<script lang="ts">
	import { Camera, Image as ImageIcon, X } from 'lucide-svelte';
	import { compressImage } from '$lib/compressImage';

	interface Props {
		value: string;
		onchange: (dataUrl: string) => void;
	}

	let { value, onchange }: Props = $props();

	let cameraInput: HTMLInputElement;
	let galleryInput: HTMLInputElement;
	let loading = $state(false);

	async function handleFile(file: File | undefined) {
		if (!file) return;
		loading = true;
		try {
			const compressed = await compressImage(file);
			onchange(compressed);
		} catch {
			// Silent fail — user can retry
		} finally {
			loading = false;
		}
	}

	function handleRemove() {
		onchange('');
		if (cameraInput) cameraInput.value = '';
		if (galleryInput) galleryInput.value = '';
	}
</script>

<div class="space-y-2">
	<span class="text-sm font-medium text-gray-700">Foto</span>

	{#if value}
		<div class="relative">
			<img src={value} alt="Foto del animal" class="h-48 w-full rounded-xl object-cover" />
			<button
				type="button"
				onclick={handleRemove}
				class="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors active:bg-black/70"
				aria-label="Quitar foto"
			>
				<X size={16} />
			</button>
		</div>
	{:else}
		<div class="flex gap-3">
			<button
				type="button"
				onclick={() => cameraInput?.click()}
				disabled={loading}
				class="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-6 text-gray-500 transition-colors active:border-green-500 active:text-green-600"
			>
				<Camera size={28} />
				<span class="text-sm font-medium">
					{loading ? 'Procesando...' : 'Cámara'}
				</span>
			</button>

			<button
				type="button"
				onclick={() => galleryInput?.click()}
				disabled={loading}
				class="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-6 text-gray-500 transition-colors active:border-green-500 active:text-green-600"
			>
				<ImageIcon size={28} />
				<span class="text-sm font-medium">
					{loading ? 'Procesando...' : 'Galería'}
				</span>
			</button>
		</div>
	{/if}

	<input
		bind:this={cameraInput}
		type="file"
		accept="image/*"
		capture="environment"
		class="hidden"
		onchange={(e) => handleFile(e.currentTarget.files?.[0])}
	/>
	<input
		bind:this={galleryInput}
		type="file"
		accept="image/*"
		class="hidden"
		onchange={(e) => handleFile(e.currentTarget.files?.[0])}
	/>
</div>
