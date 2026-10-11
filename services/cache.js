/**
 * Simple in-memory cache for external API calls (e.g. Yahoo Finance).
 *
 * - Fresh data is returned from memory without calling the API.
 * - Concurrent requests for the same key share ONE API call.
 * - If the API fails (e.g. 429 Too Many Requests), the last good
 *   data is returned instead of an error.
 * - After a failure, the API is not called again for COOLDOWN_MS,
 *   so we don't keep hammering a service that is rate-limiting us.
 */

const COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes

const store = new Map() // key -> { data, time }
const inFlight = new Map() // key -> Promise
const failedAt = new Map() // key -> timestamp of last failure

async function cached(key, ttlMs, fetcher) {
    const entry = store.get(key)
    const now = Date.now()

    // 1. Fresh data in memory -> return it
    if (entry && now - entry.time < ttlMs) return entry.data

    // 2. Recently failed -> return stale data (or throw) without calling the API
    const lastFail = failedAt.get(key)
    if (lastFail && now - lastFail < COOLDOWN_MS) {
        if (entry) return entry.data
        throw new Error('Data source is temporarily rate-limited, try again in a few minutes')
    }

    // 3. Someone is already fetching this key -> wait for the same call
    if (inFlight.has(key)) return inFlight.get(key)

    // 4. Fetch from the API
    const promise = (async () => {
        try {
            const data = await fetcher()
            store.set(key, { data, time: Date.now() })
            failedAt.delete(key)
            return data
        } catch (error) {
            failedAt.set(key, Date.now())
            if (entry) return entry.data // stale but better than an error
            throw error
        } finally {
            inFlight.delete(key)
        }
    })()

    inFlight.set(key, promise)
    return promise
}

module.exports = { cached }
