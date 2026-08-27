import { db } from '$lib/db';
import { getAllPhotos } from '$lib/store';
import { formatTagId } from '$lib/helpers';
import { buildHealthBatches } from '$lib/health';
import type { PageLoad } from './$types';

export type ActivityItem = {
	id: string;
	date: string;
	type: 'reproduccion' | 'observacion';
	title: string;
	subtitle: string;
	animalId: string;
	animalName: string;
};

/**
 * Loading here rather than in the component is what makes scroll restoration
 * work: SvelteKit does not complete a navigation — and so does not restore
 * scroll — until this resolves, so the list already has its full height.
 */
export const load: PageLoad = async () => {
	const [healthRecords, reproRecords, observations, animals, photos] = await Promise.all([
		db.health.where('deleted').equals(0).toArray(),
		db.reproduction.where('deleted').equals(0).toArray(),
		db.observations.where('deleted').equals(0).toArray(),
		db.animals.toArray(),
		getAllPhotos()
	]);

	const animalMap = new Map(
		animals.map((a) => [a.animal_id, a.nombre || formatTagId(a.arete_id) || a.animal_id])
	);
	const animalTagMap = new Map(animals.map((a) => [a.animal_id, formatTagId(a.arete_id) || '—']));

	const photoMap = new Map<string, string>();
	for (const animal of animals) {
		if (animal.foto_url) {
			photoMap.set(animal.animal_id, animal.foto_url);
		}
	}
	for (const photo of photos) {
		if (photo.deleted === 0) {
			photoMap.set(photo.animal_id, photo.data_url || photo.photo_url);
		}
	}

	const healthBatches = buildHealthBatches(healthRecords, animalMap, animalTagMap);

	const activities: ActivityItem[] = [
		...reproRecords.map((r) => ({
			id: r.reproduccion_id,
			date: r.fecha_parto_real || r.fecha_monta,
			type: 'reproduccion' as const,
			title: r.fecha_parto_real
				? 'Parto registrado'
				: r.prenez_confirmada === 'Sí'
					? 'Preñez confirmada'
					: 'Monta registrada',
			subtitle: r.fecha_parto_real
				? `Nacimiento: ${r.fecha_parto_real}`
				: r.fecha_posible_parto
					? `Posible parto: ${r.fecha_posible_parto}`
					: '',
			animalId: r.vaca_id,
			animalName: animalMap.get(r.vaca_id) ?? r.vaca_id
		})),
		...observations.map((o) => ({
			id: o.observacion_id,
			date: o.fecha,
			type: 'observacion' as const,
			title: 'Observación',
			subtitle: o.notas.slice(0, 80),
			animalId: o.animal_id,
			animalName: animalMap.get(o.animal_id) ?? o.animal_id
		}))
	].sort((a, b) => b.date.localeCompare(a.date));

	return { animalMap, animalTagMap, photoMap, healthBatches, activities };
};
