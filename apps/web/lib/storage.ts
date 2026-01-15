'use client';

import { IndexedDBStorage } from '@audio-retrieval-srs/storage';
import { StorageAdapter } from '@audio-retrieval-srs/storage';

let storageInstance: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!storageInstance) {
    storageInstance = new IndexedDBStorage();
  }
  return storageInstance;
}
