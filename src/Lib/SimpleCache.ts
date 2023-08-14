import { SimpleCacheOptions } from "../Types";
import { cloneObject } from "./Utils";

const calculateExpiryTime = (expirySeconds: number) => (expirySeconds > 0 ? Date.now() + expirySeconds * 1000 : Infinity);

type CacheValue<V> = { value: V; added: number; expires: number; accessed: number };

/**
 * Simple cache implementation that retains immutable values in memory for a limited time.
 * Immutability is enforced by cloning the stored and retrieved values. To change a cached value, it will have to be `set` again with the new value.
 */
export class SimpleCache<K, V> {
	options: SimpleCacheOptions;
	private cache: Map<K, CacheValue<V>>;
	enabled = true;

	get size() {
		return this.cache.size;
	}

	private defaultExpirySeconds: number = 100;

	constructor(options: number | SimpleCacheOptions) {
		if (typeof options === "number") {
			// Old signature: only expirySeconds given
			options = { expirySeconds: options };
		}
		options.cloneValues = options.cloneValues !== false;
		if (typeof options.expirySeconds !== "number" && typeof options.maxEntries !== "number") {
			throw new Error("Either expirySeconds or maxEntries must be specified");
		}
		this.options = options;
		this.cache = new Map();

		// Cleanup every minute
		const interval = setInterval(() => {
			this.cleanUp();
		}, 60 * 1000);
		interval.unref?.();
	}

	has(key: K) {
		if (!this.enabled) {
			return false;
		}
		return this.cache.has(key);
	}

	get(key: K): V | null {
		if (!this.enabled) {
			return null;
		}
		const entry = this.cache.get(key);
		if (!entry) {
			return null;
		} // if (!entry || entry.expires <= Date.now()) { return null; }
		entry.expires = calculateExpiryTime(this.options.expirySeconds ?? this.defaultExpirySeconds);
		entry.accessed = Date.now();
		return this.options.cloneValues ? (cloneObject(entry.value) as V) : entry.value;
	}

	set(key: K, value: V) {
		if (this.options.maxEntries && this.options.maxEntries > 0 && this.cache.size >= this.options.maxEntries && !this.cache.has(key)) {
			// console.warn(`* cache limit ${this.options.maxEntries} reached: ${this.cache.size}`);

			// Remove an expired item or the one that was accessed longest ago
			let oldest: { key: K; accessed: number } | null = null;
			const now = Date.now();

			const entries = this.cache.entries();
			let current = entries.next();

			while (!current.done) {
				const [key, entry] = current.value;
				if (entry.expires <= now) {
					// Found an expired item. Remove it now and stop
					this.cache.delete(key);
					oldest = null;
					break;
				}
				if (!oldest || entry.accessed < oldest.accessed) {
					oldest = { key, accessed: entry.accessed };
				}
				current = entries.next();
			}

			if (oldest !== null) {
				this.cache.delete(oldest.key);
			}
		}
		this.cache.set(key, {
			value: this.options.cloneValues ? (cloneObject(value) as V) : value,
			added: Date.now(),
			accessed: Date.now(),
			expires: calculateExpiryTime(this.options.expirySeconds ?? this.defaultExpirySeconds),
		});
	}

	remove(key: K) {
		this.cache.delete(key);
	}

	cleanUp() {
		const now = Date.now();
		this.cache.forEach((entry, key) => {
			if (entry.expires <= now) {
				this.cache.delete(key);
			}
		});
	}
}
