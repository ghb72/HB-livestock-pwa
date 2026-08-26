import { db } from '$lib/db';
import { getAllPhotos } from '$lib/store';
import { computeMissingAnimals } from '$lib/missingAnimals';
import type { Animal } from '$lib/types';
import { DEFAULT_SORT, type SortOption } from './sort';
import type { PageLoad } from './$types';

/**
 * Loading here rather than in `onMount` is what makes scroll restoration work:
 * SvelteKit does not complete a navigation — and so does not restore scroll —
 * until this resolves, so the list already has its full height at that point.
 *
 * `ssr = false` is inherited from the `(app)` layout, so this runs in the
 * browser only and may touch IndexedDB directly.
 */
export const load: PageLoad = async ({ url }) => {
	const search = url.searchParams.get('q') ?? '';
	const filterTipo = url.searchParams.get('tipo') ?? '';
	const sortBy = (url.searchParams.get('sort') as SortOption | null) ?? DEFAULT_SORT;

	const [allAnimals, allPhotos, missingInfo] = await Promise.all([
		db.animals.where('deleted').equals(0).toArray(),
		getAllPhotos(),
		computeMissingAnimals()
	]);

	const photoMap = new Map<string, string>();
	for (const animal of allAnimals) {
		if (animal.foto_url) {
			photoMap.set(animal.animal_id, animal.foto_url);
		}
	}
	for (const p of allPhotos) {
		photoMap.set(p.animal_id, p.data_url || p.photo_url);
	}

	const normalizedSearch = search.toLowerCase();
	const animals: Animal[] = allAnimals
		.filter((a) => a.estado === 'Vivo(a)')
		.filter((a) => {
			const nombre = String(a.nombre ?? '').toLowerCase();
			const areteId = String(a.arete_id ?? '').toLowerCase();
			const matchSearch =
				!normalizedSearch || nombre.includes(normalizedSearch) || areteId.includes(normalizedSearch);
			const matchTipo = !filterTipo || a.tipo === filterTipo;
			return matchSearch && matchTipo;
		});

	animals.sort((a, b) => {
		switch (sortBy) {
			case 'nombre_asc':
				return String(a.nombre ?? '').localeCompare(String(b.nombre ?? ''), 'es');
			case 'nombre_desc':
				return String(b.nombre ?? '').localeCompare(String(a.nombre ?? ''), 'es');
			case 'reciente':
				return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
			case 'antiguo':
				return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
			case 'edad_desc':
				return String(a.fecha_nacimiento ?? '').localeCompare(String(b.fecha_nacimiento ?? ''));
			case 'edad_asc':
				return String(b.fecha_nacimiento ?? '').localeCompare(String(a.fecha_nacimiento ?? ''));
			default:
				return 0;
		}
	});

	return { animals, photoMap, missingInfo, search, filterTipo, sortBy };
};
