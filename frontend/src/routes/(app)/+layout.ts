import { redirect } from '@sveltejs/kit';
import { isAuthenticated } from '$lib/api';
import type { LayoutLoad } from './$types';

export const ssr = false;

export const load: LayoutLoad = () => {
	if (!isAuthenticated()) {
		redirect(302, '/login');
	}
};
