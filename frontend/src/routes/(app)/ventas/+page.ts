import { db } from '$lib/db';
import { getAllPhotos } from '$lib/store';
import { formatTagId } from '$lib/helpers';
import type { PageLoad } from './$types';

/**
 * Loading here rather than in the component is what makes scroll restoration
 * work: SvelteKit does not complete a navigation — and so does not restore
 * scroll — until this resolves, so the list already has its full height.
 */
export const load: PageLoad = async () => {
	const [allSales, allAnimals, allPhotos] = await Promise.all([
		db.sales.where('deleted').equals(0).toArray(),
		db.animals.toArray(),
		getAllPhotos()
	]);

	const sales = allSales.sort((a, b) => b.fecha_venta.localeCompare(a.fecha_venta));

	const animalMap = new Map(
		allAnimals.map((a) => [a.animal_id, a.nombre || formatTagId(a.arete_id) || a.animal_id])
	);

	const photoMap = new Map<string, string>();
	for (const animal of allAnimals) {
		if (animal.foto_url) {
			photoMap.set(animal.animal_id, animal.foto_url);
		}
	}
	for (const photo of allPhotos) {
		if (photo.deleted === 0) {
			photoMap.set(photo.animal_id, photo.data_url || photo.photo_url);
		}
	}

	return { sales, animalMap, photoMap };
};
