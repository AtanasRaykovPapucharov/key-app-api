const { pool } = require("../db");

const normalizeRow = (row) => ({
    id: row.id,
    uid: row.uid,
    title: row.title,
    schedule_type: row.schedule_type,
    recurrence: row.recurrence,
    cron_expression: row.cron_expression || "",
    interval_value: Number(row.interval_value ?? 1),
    schedule_date: row.schedule_date,
    schedule_time: row.schedule_time,
    trigger_condition: row.trigger_condition || "",
    details: row.details || "",
    enabled: row.enabled !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

const validateSchedulerPayload = (payload = {}, { isAdmin = false } = {}) => {
    const title = String(payload.title ?? "").trim();
    const scheduleType = String(payload.schedule_type ?? "user").trim();
    const recurrence = String(payload.recurrence ?? "date-time").trim();

    if (!title) throw new Error("Scheduler title is required");

    const validTypes = ["user", "system", "strategy"];
    const validRecurrence = [
        "date-time",
        "minutes",
        "hours",
        "daily",
        "weekly",
        "monthly",
        "cron",
    ];

    if (!validTypes.includes(scheduleType)) {
        throw new Error("Invalid scheduler type");
    }

    if (scheduleType === "system" && !isAdmin) {
        const error = new Error(
            "Only administrators can create system notifications",
        );
        error.statusCode = 403;
        throw error;
    }

    if (!validRecurrence.includes(recurrence)) {
        throw new Error("Invalid scheduler recurrence");
    }

    const intervalValue = Number(payload.interval_value ?? 1);
    if (!Number.isInteger(intervalValue) || intervalValue < 1) {
        throw new Error("Scheduler interval must be a positive integer");
    }

    const cronExpression = String(payload.cron_expression ?? "").trim();
    if (recurrence === "cron" && !/^\S+(\s+\S+){4}$/.test(cronExpression)) {
        throw new Error("Invalid cron expression: use 5 fields");
    }

    return {
        title,
        schedule_type: scheduleType,
        recurrence,
        interval_value: intervalValue,
        cron_expression: recurrence === "cron" ? cronExpression : null,
        schedule_date: payload.schedule_date || null,
        schedule_time: payload.schedule_time || null,
        trigger_condition: String(payload.trigger_condition ?? "").trim(),
        details: String(payload.details ?? "").trim(),
        enabled: payload.enabled !== false,
    };
};

async function listByUser(uid) {
    const { rows } = await pool.query(
        `SELECT *
         FROM public.scheduler_entries
         WHERE uid = $1::uuid
         ORDER BY created_at DESC, id DESC`,
        [uid],
    );

    return rows.map(normalizeRow);
}

async function getById(id, uid) {
    const { rows } = await pool.query(
        `SELECT *
         FROM public.scheduler_entries
         WHERE id = $1::uuid AND uid = $2::uuid`,
        [id, uid],
    );

    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function create({ uid, isAdmin, ...payload }) {
    const validated = validateSchedulerPayload(payload, { isAdmin });

    const { rows } = await pool.query(
        `INSERT INTO public.scheduler_entries (
            uid,
            title,
            schedule_type,
            recurrence,
            interval_value,
            cron_expression,
            schedule_date,
            schedule_time,
            trigger_condition,
            details,
            enabled
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
            uid,
            validated.title,
            validated.schedule_type,
            validated.recurrence,
            validated.interval_value,
            validated.cron_expression,
            validated.schedule_date,
            validated.schedule_time,
            validated.trigger_condition,
            validated.details,
            validated.enabled,
        ],
    );

    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function update(id, uid, payload, { isAdmin = false } = {}) {
    const validated = validateSchedulerPayload(payload, { isAdmin });

    const { rows } = await pool.query(
        `UPDATE public.scheduler_entries
         SET title = $1,
             schedule_type = $2,
             recurrence = $3,
             interval_value = $4,
             cron_expression = $5,
             schedule_date = $6,
             schedule_time = $7,
             trigger_condition = $8,
             details = $9,
             enabled = $10,
             updated_at = NOW()
         WHERE id = $11::uuid AND uid = $12::uuid
         RETURNING *`,
        [
            validated.title,
            validated.schedule_type,
            validated.recurrence,
            validated.interval_value,
            validated.cron_expression,
            validated.schedule_date,
            validated.schedule_time,
            validated.trigger_condition,
            validated.details,
            validated.enabled,
            id,
            uid,
        ],
    );

    return rows[0] ? normalizeRow(rows[0]) : null;
}

async function remove(id, uid) {
    const { rows } = await pool.query(
        `DELETE FROM public.scheduler_entries
         WHERE id = $1::uuid AND uid = $2::uuid
         RETURNING id`,
        [id, uid],
    );

    return rows[0]?.id ?? null;
}

module.exports = {
    listByUser,
    getById,
    create,
    update,
    remove,
};
