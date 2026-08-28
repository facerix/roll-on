import { v4WithTimestamp } from '/src/uuid.js';
import {
  createEmptyRunResultStore,
  insertRunResult,
  parseRunResultStore,
  serializeRunResultStore,
  type RunResultRecord,
  type RunResultStore,
} from '/src/game/runResults.js';

export type DataRecord = RunResultRecord;
export type ChangeType = 'init' | 'add' | 'delete';

export interface DataStoreChangeDetail {
  readonly items: readonly RunResultRecord[];
  readonly changeType: ChangeType;
  readonly affectedRecords: RunResultRecord | readonly string[];
}

let instance: DataStore | null = null;

/** Versioned, immutable run-result persistence over the historical `scores` key. */
class DataStore extends EventTarget {
  #store: RunResultStore = createEmptyRunResultStore();
  #itemsById = new Map<string, RunResultRecord>();

  constructor() {
    if (instance) throw new Error('New DataStore instance cannot be created');
    super();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    instance = this;
  }

  async init(): Promise<void> {
    const saved = window.localStorage.getItem('scores');
    this.#store =
      saved === null
        ? createEmptyRunResultStore()
        : parseRunResultStore(saved, {
            createId: v4WithTimestamp,
            now: () => new Date().toISOString(),
          });
    this.#reindexAndSave();
    setTimeout(() => this.#emitChangeEvent('init', ['*']), 0);
  }

  import(jsonData: string): void {
    const imported = parseRunResultStore(jsonData, {
      createId: v4WithTimestamp,
      now: () => new Date().toISOString(),
    });
    let merged = this.#store;
    for (const result of [...imported.results].reverse()) {
      merged = insertRunResult(merged, result);
    }
    this.#store = merged;
    this.#reindexAndSave();
    setTimeout(() => this.#emitChangeEvent('init', ['*']), 0);
  }

  get items(): readonly RunResultRecord[] {
    return this.#store.results;
  }

  getItemById(id: string): RunResultRecord | undefined {
    return this.#itemsById.get(id);
  }

  /** Add once. An exact replay is a no-op; conflicting reuse of an id throws. */
  addItem(record: RunResultRecord): void {
    const next = insertRunResult(this.#store, record);
    if (next === this.#store) return;
    this.#store = next;
    this.#reindexAndSave();
    this.#emitChangeEvent('add', record);
  }

  addRunResult(record: RunResultRecord): void {
    this.addItem(record);
  }

  deleteItem(id: string): void {
    if (!this.#itemsById.has(id)) return;
    this.#store = Object.freeze({
      version: 1,
      results: Object.freeze(this.#store.results.filter(result => result.id !== id)),
    });
    this.#reindexAndSave();
    this.#emitChangeEvent('delete', [id]);
  }

  #reindexAndSave(): void {
    this.#itemsById = new Map(this.#store.results.map(result => [result.id, result]));
    window.localStorage.setItem('scores', serializeRunResultStore(this.#store));
  }

  #emitChangeEvent(
    changeType: ChangeType,
    affectedRecords: DataStoreChangeDetail['affectedRecords']
  ): void {
    this.dispatchEvent(
      new CustomEvent<DataStoreChangeDetail>('change', {
        detail: { items: this.#store.results, changeType, affectedRecords },
      })
    );
  }
}

const singleton = Object.freeze(new DataStore());

export default singleton;
