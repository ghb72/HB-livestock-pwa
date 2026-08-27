import { afterNavigate, goto } from '$app/navigation';

/**
 * Tracks how many in-app history entries can be popped.
 *
 * The app runs as a `display: standalone` PWA, so the OS back gesture and the
 * in-app "Volver" arrow are the only ways back. A bare `history.back()` on the
 * first entry of a session (opened from the app icon, or reached right after
 * the /login redirect) escapes the PWA instead, so callers need to know whether
 * there is anything to go back to.
 */
let depth = $state(0);

/** Set by `replaceWith` so the next `afterNavigate` does not count the entry. */
let pendingReplace = false;

/** Register the history tracker. Must run during component init — see `(app)/+layout.svelte`. */
export function initHistoryTracking(): void {
	afterNavigate((nav) => {
		if (nav.type === 'enter') return;

		if (nav.type === 'popstate') {
			depth = Math.max(0, depth - 1);
			return;
		}

		if (pendingReplace) {
			pendingReplace = false;
			return;
		}

		depth += 1;
	});
}

/** True when there is an in-app history entry to pop. */
export function canGoBack(): boolean {
	return depth > 0;
}

/**
 * Go back to the previous page, falling back to `fallback` when this page is
 * the first entry of the session.
 */
export function goBack(fallback: string): void {
	if (canGoBack()) {
		history.back();
	} else {
		void goto(fallback, { replaceState: true });
	}
}

/**
 * Navigate replacing the current history entry, keeping the depth counter honest.
 * Use after a save or delete so back does not re-enter a submitted form or a
 * record that no longer exists.
 */
export function replaceWith(
	url: string,
	opts?: Parameters<typeof goto>[1]
): ReturnType<typeof goto> {
	pendingReplace = true;
	return goto(url, { ...opts, replaceState: true });
}
