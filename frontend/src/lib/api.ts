/**
 * Centralized API layer with Bearer token authentication.
 *
 * All HTTP requests go through request<T>() which attaches
 * the auth token and handles errors uniformly.
 */

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
	status: number;
	body: string;

	constructor(status: number, body: string) {
		super(`API ${status}: ${body}`);
		this.name = 'ApiError';
		this.status = status;
		this.body = body;
	}
}

function getToken(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem('auth_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const token = getToken();
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...((options.headers as Record<string, string>) ?? {})
	};
	if (token) {
		headers['Authorization'] = `Bearer ${token}`;
	}

	const res = await fetch(`${API_URL}${path}`, { ...options, headers });
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new ApiError(res.status, body);
	}

	if (res.status === 204) return undefined as T;

	const body = await res.text().catch(() => '');
	if (!body) return undefined as T;

	return JSON.parse(body) as T;
}

// ── Auth ─────────────────────────────────────────────────

export async function login(token: string): Promise<boolean> {
	const res = await fetch(`${API_URL}/api/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token })
	});
	if (res.ok) {
		const data = await res.json().catch(() => ({}));
		if (data.valid) {
			localStorage.setItem('auth_token', token);
			return true;
		}
	}
	return false;
}

export function logout(): void {
	localStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
	return !!getToken();
}

// ── Sync state ───────────────────────────────────────────

export interface ApiSyncState {
	modified_at: string;
	version: string;
}

export async function apiGetSyncState(): Promise<ApiSyncState> {
	return request('/api/sync/state');
}

// ── Table sync (batch push → merged response) ───────────

interface SyncResponse {
	merged: Record<string, unknown>[];
	synced_count: number;
	server_count: number;
}

export async function apiSyncTable(
	tableName: string,
	records: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
	const data = await request<SyncResponse>(`/api/sync/${tableName}`, {
		method: 'POST',
		body: JSON.stringify({ records })
	});
	return data.merged;
}

// ── Pull all tables ──────────────────────────────────────

interface PullResponse {
	animals: Record<string, unknown>[];
	health: Record<string, unknown>[];
	reproduction: Record<string, unknown>[];
	observations: Record<string, unknown>[];
	sales: Record<string, unknown>[];
	recorridos: Record<string, unknown>[];
}

export async function apiPullAll(): Promise<PullResponse> {
	return request('/api/sync/pull');
}

// ── Photos ───────────────────────────────────────────────

interface UploadedPhoto {
	photo_id: string;
	animal_id: string;
	photo_url: string;
}

interface PhotoUploadError {
	photo_id: string;
	error: string;
}

export async function apiUploadPhotos(
	photos: { photo_id: string; animal_id: string; data_url: string }[]
): Promise<{ uploaded: UploadedPhoto[]; errors: PhotoUploadError[] }> {
	return request<{ uploaded: UploadedPhoto[]; errors: PhotoUploadError[] }>('/api/photos/upload/batch', {
		method: 'POST',
		body: JSON.stringify({ photos })
	});
}

export async function apiDeletePhoto(photoId: string, photoUrl: string): Promise<void> {
	const query = new URLSearchParams({ photo_url: photoUrl });
	await request<void>(`/api/photos/${encodeURIComponent(photoId)}?${query}`, {
		method: 'DELETE'
	});
}
