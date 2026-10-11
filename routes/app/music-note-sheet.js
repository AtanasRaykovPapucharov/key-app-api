const express = require("express");
const { pool } = require("../../services/db.js");

const TABLE_NAME = "music_note_sheet";

const normalizeSheetRow = (row) => {
    let notes = row.notes ?? [];

    if (typeof notes === "string") {
        try {
            notes = JSON.parse(notes);
        } catch {
            notes = [];
        }
    }

    const normalized = {
        id: row.id,
        name: row.name ?? "Untitled sheet",
        width: Number(row.width ?? 730),
        clef: row.clef ?? "treble",
        beat: row.beat ?? "4/4",
        sharps: Number(row.sharps ?? 0),
        flats: Number(row.flats ?? 0),
        notes: Array.isArray(notes) ? notes : [],
    };

    if (row.created_at) normalized.created_at = row.created_at;
    if (row.updated_at) normalized.updated_at = row.updated_at;

    return normalized;
};

const parseBody = (body) => {
    if (!body) return { name: "Untitled sheet", notes: [] };

    const row = body.row ?? body;

    return {
        name: row.name ?? "Untitled sheet",
        width: Number(row.width ?? 730),
        clef: row.clef ?? "treble",
        beat: row.beat ?? "4/4",
        sharps: Number(row.sharps ?? 0),
        flats: Number(row.flats ?? 0),
        notes: Array.isArray(row.notes) ? row.notes : [],
    };
};

const router = express.Router();

const getUid = (req, res) => {
    const uid = req.headers["x-uid"];

    if (!uid) {
        res.status(400).json({ error: "uid is required" });
        return null;
    }

    return uid;
};

router.get("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;

        const query = `SELECT id, name, width, clef, beat, sharps, flats, notes, created_at, updated_at FROM ${TABLE_NAME} WHERE uid = $1::uuid ORDER BY id DESC`;
        const { rows } = await pool.query(query, [uid]);

        res.status(200).json({
            data: rows.map(normalizeSheetRow),
        });
    } catch (err) {
        console.error("music note sheet load error:", err);
        res.status(500).json({
            message: err.message || "Failed to load music note sheets",
        });
    }
});

router.post("/", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;
        const sheet = parseBody(req.body);

        const query = `
            INSERT INTO ${TABLE_NAME} (uid, name, width, clef, beat, sharps, flats, notes)
            VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb)
            RETURNING *
        `;

        const { rows } = await pool.query(query, [
            uid,
            sheet.name,
            sheet.width,
            sheet.clef,
            sheet.beat,
            sheet.sharps,
            sheet.flats,
            JSON.stringify(sheet.notes),
        ]);
        const saved = rows[0];

        res.status(201).json({
            data: normalizeSheetRow(saved),
        });
    } catch (err) {
        console.error("music note sheet save error:", err);
        res.status(500).json({
            message: err.message || "Failed to save music note sheet",
        });
    }
});

router.put("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;
        const sheet = parseBody(req.body);

        const query = `
            UPDATE ${TABLE_NAME}
            SET name = $1,
                width = $2,
                clef = $3,
                beat = $4,
                sharps = $5,
                flats = $6,
                notes = $7::jsonb,
                updated_at = NOW()
            WHERE id = $8 AND uid = $9::uuid
            RETURNING *
        `;

        const { rows } = await pool.query(query, [
            sheet.name,
            sheet.width,
            sheet.clef,
            sheet.beat,
            sheet.sharps,
            sheet.flats,
            JSON.stringify(sheet.notes),
            req.params.id,
            uid,
        ]);

        if (!rows[0]) {
            return res
                .status(404)
                .json({ message: "Music note sheet not found" });
        }

        res.status(200).json({
            data: normalizeSheetRow(rows[0]),
        });
    } catch (err) {
        console.error("music note sheet update error:", err);
        res.status(500).json({
            message: err.message || "Failed to update music note sheet",
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const uid = getUid(req, res);
        if (!uid) return;
        const query = `DELETE FROM ${TABLE_NAME} WHERE id = $1 AND uid = $2::uuid RETURNING id`;
        const { rows } = await pool.query(query, [req.params.id, uid]);

        if (!rows[0]) {
            return res
                .status(404)
                .json({ message: "Music note sheet not found" });
        }

        res.status(200).json({ deleted: true, id: rows[0].id });
    } catch (err) {
        console.error("music note sheet delete error:", err);
        res.status(500).json({
            message: err.message || "Failed to delete music note sheet",
        });
    }
});

module.exports = router;
