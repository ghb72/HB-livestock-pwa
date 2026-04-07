/**
 * Sync service — client-side sync engine.
 *
 * Handles bidirectional sync between IndexedDB and the backend API.
 * Uses timestamp-based last-write-wins strategy.
 * Photos are uploaded to Google Drive via the backend.
 */

import type { Table } from "dexie";
import { db } from "../db";
import type { AnimalPhoto } from "../types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/** Sync all local and cloud records bidirectionally. */
export async function syncAll(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) {
    return { synced: 0, errors: 0 };
  }

  let synced = 0;
  const errors = 0;

  // Sync photos first so Drive URLs are available
  synced += await syncPhotos();

  // Sync each table — always pushes pending AND pulls cloud state
  synced += await syncTable("animals", db.animals);
  synced += await syncTable("health", db.health);
  synced += await syncTable("reproduction", db.reproduction);
  synced += await syncTable("observations", db.observations);
  synced += await syncTable("sales", db.sales);
  synced += await syncTable("recorridos", db.recorridos);

  return { synced, errors };
}

/**
 * Sync a single table — always contacts the server to push pending
 * records AND pull the merged cloud state back.
 *
 * Even when there are no local pending records the server is called
 * so that cloud-side changes (edits, deletions) are reflected locally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncTable(name: string, table: Table<any, any>): Promise<number> {
  try {
    const pending = await table.where("_sync_status").equals("pending").toArray();

    const response = await fetch(`${API_BASE}/api/sync/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: pending }),
    });

    if (!response.ok) return 0;

    const { merged } = (await response.json()) as { merged: Record<string, unknown>[] };

    // Replace local table with the authoritative merged dataset
    await db.transaction("rw", table, async () => {
      await table.clear();
      await table.bulkAdd(merged);
    });

    return pending.length;
  } catch {
    return 0;
  }
}

/** Pull full dataset from server (initial load or manual refresh). */
export async function pullAll(): Promise<void> {
  if (!navigator.onLine) return;

  try {
    const response = await fetch(`${API_BASE}/api/sync/pull`);
    if (!response.ok) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as Record<string, any[]>;

    await db.transaction("rw", db.animals, async () => {
      await db.animals.clear();
      await db.animals.bulkAdd(data.animals);
    });
    await db.transaction("rw", db.health, async () => {
      await db.health.clear();
      await db.health.bulkAdd(data.health);
    });
    await db.transaction("rw", db.reproduction, async () => {
      await db.reproduction.clear();
      await db.reproduction.bulkAdd(data.reproduction);
    });
    await db.transaction("rw", db.observations, async () => {
      await db.observations.clear();
      await db.observations.bulkAdd(data.observations);
    });
    await db.transaction("rw", db.sales, async () => {
      await db.sales.clear();
      await db.sales.bulkAdd(data.sales);
    });
    await db.transaction("rw", db.recorridos, async () => {
      await db.recorridos.clear();
      await db.recorridos.bulkAdd(data.recorridos);
    });
  } catch {
    // Offline or server unavailable — silent fail
  }
}

/**
 * Upload pending photos to Google Drive via the backend.
 *
 * Sends base64 data in batch, receives Drive URLs back,
 * updates local records so data_url can be cleared later
 * and drive_url is persisted.
 */
async function syncPhotos(): Promise<number> {
  try {
    const pending: AnimalPhoto[] = await db.photos
      .where("_sync_status")
      .equals("pending")
      .toArray();

    if (pending.length === 0) return 0;

    const response = await fetch(`${API_BASE}/api/photos/upload/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photos: pending.map((p) => ({
          photo_id: p.photo_id,
          animal_id: p.animal_id,
          data_url: p.data_url,
        })),
      }),
    });

    if (!response.ok) return 0;

    const { uploaded } = (await response.json()) as {
      uploaded: { photo_id: string; animal_id: string; drive_url: string }[];
    };

    // Update local records with Drive URLs and mark as synced
    await db.transaction("rw", db.photos, db.animals, async () => {
      for (const item of uploaded) {
        await db.photos.update(item.photo_id, {
          drive_url: item.drive_url,
          _sync_status: "synced",
        });

        // Also update the animal's foto_url field
        await db.animals
          .where("animal_id")
          .equals(item.animal_id)
          .modify({ foto_url: item.drive_url });
      }
    });

    return uploaded.length;
  } catch {
    return 0;
  }
}
