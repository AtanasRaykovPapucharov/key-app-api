const {
    scheduleDaily,
    scheduleHourly,
    scheduleEvery3Hours,
    scheduleEverySunday,
} = require("./scheduler");

async function sendReport(type, userId) {
    console.log(`Sending ${type} report to user ${userId}`);
}

// Start
const stopDaily = scheduleDaily(sendReport, "daily", 123);

const stopHourly = scheduleHourly(sendReport, "hourly", 123);

const stopEvery3Hours = scheduleEvery3Hours(sendReport, "every-3-hours", 123);

const stopSunday = scheduleEverySunday(sendReport, "sunday", 123);

// Stop individual job
stopDaily();

// Stop another job
stopHourly();

// ==========================================================

const { schedule } = require("./scheduler");

async function cleanup(type) {
    console.log(`Running ${type} cleanup`);
}

const stop = schedule("*/10 * * * *", cleanup, "temporary-files");

// Later:
stop();

// ==========================================================

const { scheduleMany } = require("./scheduler");

const stopAll = scheduleMany([
    {
        expression: "0 0 * * *",
        callback: cleanup,
        args: ["daily"],
    },
    {
        expression: "0 * * * *",
        callback: cleanup,
        args: ["hourly"],
    },
    {
        expression: "0 */3 * * *",
        callback: cleanup,
        args: ["every-3-hours"],
    },
]);

// Stop all jobs
stopAll();
