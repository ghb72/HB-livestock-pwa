import { writable } from 'svelte/store';

export interface PhotoLightboxState {
	src: string;
	alt: string;
}

export const photoLightbox = writable<PhotoLightboxState | null>(null);

export function openPhotoLightbox(src: string, alt: string) {
	photoLightbox.set({ src, alt });
}

export function closePhotoLightbox() {
	photoLightbox.set(null);
}