// singleton class to manage the user's data

import { v4WithTimestamp } from '/src/uuid.js';

/**
 * Minimum shape of a record. Apps consuming this template are expected to
 * extend it with their own fields; the store doesn't care what else lives on
 * the object, only that every record has an id.
 */
export interface DataRecord {
  id: string;
  [key: string]: unknown;
}

export type ChangeType = 'init' | 'add' | 'update' | 'delete';

export interface DataStoreChangeDetail {
  items: DataRecord[];
  changeType: ChangeType;
  affectedRecords: DataRecord | DataRecord[] | string[];
}

let instance: DataStore | null = null;

class DataStore extends EventTarget {
  #items: DataRecord[] = [];
  #itemsById: Map<string, DataRecord> = new Map();

  constructor() {
    if (instance) {
      throw new Error('New instance cannot be created!!');
    }
    super();

    // Singleton: cache `this` so a second `new DataStore()` throws above.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
  }

  #loadRecordsFromJson(json: string): DataRecord[] {
    try {
      const records: unknown = JSON.parse(json);
      if (!Array.isArray(records)) {
        console.warn('[DataStore] Expected array JSON, falling back to empty list.');
        return [];
      }
      records.forEach((item: DataRecord, index: number) => {
        if (!item.id) {
          records[index].id = v4WithTimestamp();
        }
      });
      return records as DataRecord[];
    } catch (error) {
      console.warn('[DataStore] Failed to parse stored JSON, resetting items.', error);
      try {
        window.localStorage.setItem('items', '[]');
      } catch (storageError) {
        console.warn('[DataStore] Failed to reset stored items.', storageError);
      }
      return [];
    }
  }

  async init(): Promise<void> {
    let savedItemsJson = window.localStorage.getItem('items');
    if (!savedItemsJson) {
      savedItemsJson = '[]';
      window.localStorage.setItem('items', savedItemsJson);
    }
    this.#items = this.#loadRecordsFromJson(savedItemsJson);
    this.#reindex();

    setTimeout(() => {
      this.#emitChangeEvent('init', ['*']);
    }, 0);
  }

  import(jsonData: string): void {
    const newItems = this.#loadRecordsFromJson(jsonData);
    Array.prototype.unshift.apply(this.#items, newItems);
    this.#reindex();

    setTimeout(() => {
      this.#emitChangeEvent('init', ['*']);
    }, 0);
  }

  #saveItems(): void {
    window.localStorage.setItem('items', JSON.stringify(this.#items));
  }

  #emitChangeEvent(
    changeType: ChangeType,
    affectedRecords: DataStoreChangeDetail['affectedRecords']
  ): void {
    const changeEvent = new CustomEvent<DataStoreChangeDetail>('change', {
      detail: {
        items: this.#items,
        changeType,
        affectedRecords,
      },
    });
    this.dispatchEvent(changeEvent);
  }

  #reindex(): void {
    this.#itemsById = new Map();
    this.#items.forEach(item => {
      this.#itemsById.set(item.id, item);
    });
    this.#saveItems();
  }

  get items(): DataRecord[] {
    return this.#items;
  }

  getItemById(id: string): DataRecord | undefined {
    return this.#itemsById.get(id);
  }

  addItem(record: DataRecord): void {
    record.id = v4WithTimestamp();
    this.#items.unshift(record);
    this.#reindex();
    this.#emitChangeEvent('add', record);
  }

  updateItem(record: DataRecord): void {
    const index = this.#items.findIndex(rec => rec.id === record.id);
    if (index > -1) {
      this.#items[index] = record;
      this.#reindex();
      this.#emitChangeEvent('update', record);
    }
  }

  deleteItem(id: string): void {
    if (this.#itemsById.has(id)) {
      this.#items = this.#items.filter(r => r.id !== id);
      this.#reindex();
      this.#emitChangeEvent('delete', [id]);
    }
  }
}

const singleton = Object.freeze(new DataStore());

export default singleton;
