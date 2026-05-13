<script lang="ts">
	import { openPhotoLightbox } from '$lib/photoLightbox';

	interface Props {
		src: string;
		alt: string;
		imgClass?: string;
		triggerClass?: string;
		triggerLabel?: string;
	}

	let {
		src,
		alt,
		imgClass = '',
		triggerClass = 'inline-block',
		triggerLabel = 'Ver foto en grande'
	}: Props = $props();

	function openPreview(event: MouseEvent | KeyboardEvent) {
		event.preventDefault();
		event.stopPropagation();
		openPhotoLightbox(src, alt);
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		openPreview(event);
	}

</script>

<div
	role="button"
	tabindex="0"
	aria-label={triggerLabel}
	onclick={openPreview}
	onkeydown={handleTriggerKeydown}
	class="{triggerClass} cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2"
>
	<img src={src} alt={alt} class={imgClass} />
</div>