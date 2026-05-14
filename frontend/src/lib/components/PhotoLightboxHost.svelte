<script lang="ts">
	import { browser } from '$app/environment';
	import { X } from 'lucide-svelte';
	import { closePhotoLightbox, photoLightbox } from '$lib/photoLightbox';

	$effect(() => {
		if (!browser || !$photoLightbox) return;

		const previousOverflow = document.body.style.overflow;
		const handleWindowKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closePhotoLightbox();
			}
		};

		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', handleWindowKeydown);

		return () => {
			document.body.style.overflow = previousOverflow;
			window.removeEventListener('keydown', handleWindowKeydown);
		};
	});

	function swallowEvent(event: Event) {
		event.preventDefault();
		event.stopPropagation();
	}

	function swallowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		swallowEvent(event);
	}

	function handleCloseClick(event: MouseEvent) {
		swallowEvent(event);
		closePhotoLightbox();
	}
</script>

{#if $photoLightbox}
	<div
		class="fixed inset-0 z-[200] bg-black/82 p-4"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onpointerdown={swallowEvent}
		onpointerup={swallowEvent}
		onclick={swallowEvent}
		onkeydown={swallowKeydown}
	>
		<button
			type="button"
			onclick={handleCloseClick}
			class="absolute right-4 top-4 z-30 rounded-full bg-white/14 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/24"
			aria-label="Cerrar vista ampliada"
		>
			<X size={22} />
		</button>

		<div class="pointer-events-none relative z-10 flex h-full items-center justify-center">
			<img
				src={$photoLightbox.src}
				alt={$photoLightbox.alt}
				class="max-h-[88vh] max-w-[92vw] object-contain"
			/>
		</div>
	</div>
{/if}