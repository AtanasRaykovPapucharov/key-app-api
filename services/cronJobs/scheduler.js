// scheduler.js
const cron = require("node-cron");

/**
 * Generic Cron Scheduler Service
 *
 * Install:
 *   npm install node-cron
 *
 * Example:
 *   const stop = scheduleDaily(myFunction, "hello");
 *   stop();
 */

/**
 * Every hour.
 *
 * Cron:
 *   0 * * * *
 */
function scheduleHourly(callback, ...args) {
    return schedule("0 * * * *", callback, ...args);
}

/**
 * Every 3 hours.
 *
 * Cron:
 *   0 star-slash-3 * * *
 */
function scheduleEvery3Hours(callback, ...args) {
    return schedule("0 */3 * * *", callback, ...args);
}

/**
 * Every day at midnight.
 *
 * Cron:
 *   0 0 * * *
 */
function scheduleDaily(callback, ...args) {
    return schedule("0 0 * * *", callback, ...args);
}

/**
 * Every Monday at midnight.
 *
 * Cron:
 *   0 0 * * 1
 */
function scheduleWeekly(callback, ...args) {
    return schedule("0 0 * * 1", callback, ...args);
}

/**
 * First day of every month at midnight.
 *
 * Cron:
 *   0 0 1 * *
 */
function scheduleMonthly(callback, ...args) {
    return schedule("0 0 1 * *", callback, ...args);
}

/**
 * Every Sunday at midnight.
 *
 * Cron:
 *   0 0 * * 0
 */
function scheduleEverySunday(callback, ...args) {
    return schedule("0 0 * * 0", callback, ...args);
}

/**
 * Every Monday at midnight.
 *
 * Cron:
 *   0 0 * * 1
 */
function scheduleEveryMonday(callback, ...args) {
    return schedule("0 0 * * 1", callback, ...args);
}

/**
 * Every Tuesday at midnight.
 *
 * Cron:
 *   0 0 * * 2
 */
function scheduleEveryTuesday(callback, ...args) {
    return schedule("0 0 * * 2", callback, ...args);
}

/**
 * Every Wednesday at midnight.
 *
 * Cron:
 *   0 0 * * 3
 */
function scheduleEveryWednesday(callback, ...args) {
    return schedule("0 0 * * 3", callback, ...args);
}

/**
 * Every Thursday at midnight.
 *
 * Cron:
 *   0 0 * * 4
 */
function scheduleEveryThursday(callback, ...args) {
    return schedule("0 0 * * 4", callback, ...args);
}

/**
 * Every Friday at midnight.
 *
 * Cron:
 *   0 0 * * 5
 */
function scheduleEveryFriday(callback, ...args) {
    return schedule("0 0 * * 5", callback, ...args);
}

/**
 * Every Saturday at midnight.
 *
 * Cron:
 *   0 0 * * 6
 */
function scheduleEverySaturday(callback, ...args) {
    return schedule("0 0 * * 6", callback, ...args);
}

// ===========================================================================

/**
 * Schedule a generic cron job.
 *
 * @param {string} expression
 * @param {Function} callback
 * @param {...any} args
 * @returns {Function} stopper function
 */
function schedule(expression, callback, ...args) {
    if (typeof callback !== "function") {
        throw new TypeError("callback must be a function");
    }

    const task = cron.schedule(expression, async () => {
        try {
            await callback(...args);
        } catch (error) {
            console.error(`[CRON] Job failed: ${expression}`, error);
            throw new Error(error);
        }
    });

    console.log(`[CRON] Scheduled: ${expression}`);

    /**
     * Stop this specific cron job.
     */
    return function stop() {
        task.stop();

        console.log(`[CRON] Stopped: ${expression}`);
    };
}

/**
 * Schedule multiple jobs.
 *
 * Returns a single function that stops
 * all scheduled jobs.
 *
 * @param {Array} jobs
 * @returns {Function} stopAll function
 */
function scheduleMany(jobs) {
    const stoppers = jobs.map((job) => {
        const { expression, callback, args = [] } = job;

        return schedule(expression, callback, ...args);
    });

    return function stopAll() {
        stoppers.forEach((stop) => stop());
    };
}

module.exports = {
    scheduleMany,
    schedule,
    scheduleHourly,
    scheduleEvery3Hours,
    scheduleDaily,
    scheduleWeekly,
    scheduleMonthly,
    scheduleEverySunday,
    scheduleEveryMonday,
    scheduleEveryTuesday,
    scheduleEveryWednesday,
    scheduleEveryThursday,
    scheduleEveryFriday,
    scheduleEverySaturday,
};
