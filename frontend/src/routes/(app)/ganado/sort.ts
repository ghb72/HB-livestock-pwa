// Shared by +page.ts (which applies the sort) and +page.svelte (which renders
// the picker). It cannot live in +page.ts: SvelteKit only allows `load`,
// `prerender`, `csr`, `ssr`, `trailingSlash`, `config` and `entries` to be
// exported from a page module.

export type SortOption =
	| 'nombre_asc'
	| 'nombre_desc'
	| 'reciente'
	| 'antiguo'
	| 'edad_desc'
	| 'edad_asc';

export const DEFAULT_SORT: SortOption = 'reciente';

export const SORT_LABELS: Record<SortOption, string> = {
	nombre_asc: 'Nombre A→Z',
	nombre_desc: 'Nombre Z→A',
	reciente: 'Más nuevo',
	antiguo: 'Más antiguo',
	edad_desc: 'Mayor edad',
	edad_asc: 'Menor edad'
};
