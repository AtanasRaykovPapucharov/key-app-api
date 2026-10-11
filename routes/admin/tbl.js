const express = require("express");
const format = require("pg-format");
const { pool } = require("../../services/db.js");

module.exports = (tblName) => {
    const router = express.Router();

    router.get("/", async (req, res) => {
        try {
            const result = await pool.query(
                format("SELECT * FROM %I ORDER BY %I", tblName, tblName + "id"),
            );
            res.status(200).json(result.rows);
        } catch (err) {
            res.status(500).json({ message: "Server error" });
        }
    });

    router.get("/:id", async (req, res) => {
        try {
            const result = await pool.query(
                format("SELECT * FROM %I WHERE %I = $1", tblName, "id"),
                [req.params.id],
            );
            res.status(200).json(result.rows[0] || {});
        } catch (err) {
            res.status(500).json({ message: "Server error" });
        }
    });

    router.post("/", async (req, res) => {
        try {
            const { tableName, row } = req.body;
            if (!tableName)
                return res.status(400).send("tableName is required");
            if (!row) return res.status(400).send("row is required");

            const filteredRow = Object.fromEntries(
                Object.entries(row).filter(([key]) => key !== `${tableName}id`),
            );
            const props = Object.keys(filteredRow).join(", ");
            const placeholders = Object.keys(filteredRow)
                .map((_, i) => `$${i + 1}`)
                .join(", ");
            const values = Object.values(filteredRow);

            const query = format(
                "INSERT INTO %I (%I) VALUES (%I) RETURNING *",
                tableName,
                props,
                placeholders,
            );

            const result = await pool.query(query, values);
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error(err);
            res.status(500).send("Error posting row: " + err);
        }
    });

    // router.put("/", async (req, res) => {
    //     try {
    //         const { tableName, row } = req.body;
    //         if (!tableName)
    //             return res.status(400).send("tableName is required");
    //         if (!row) return res.status(400).send("row is required");

    //         const notAllowedTables = ["users"]; // blacklist
    //         if (notAllowedTables.includes(tableName))
    //             return res.status(400).send("Invalid tableName");

    //         // 2️⃣ Extract primary key value
    //         const primaryKey = `id`;
    //         const idValue = row[primaryKey];
    //         if (!idValue)
    //             return res
    //                 .status(400)
    //                 .send(`${primaryKey} is required for update`);

    //         // 3️⃣ Remove primary key from update fields
    //         const filteredRow = Object.fromEntries(
    //             Object.entries(row).filter(([key]) => key !== primaryKey),
    //         );

    //         if (Object.keys(filteredRow).length === 0) {
    //             return res.status(400).send("No fields to update");
    //         }

    //         // 4️⃣ Build SET clause dynamically
    //         const setClauses = Object.keys(filteredRow)
    //             .map((key, i) => `${key} = $${i + 1}`)
    //             .join(", ");
    //         const values = Object.values(filteredRow);

    //         // Add primary key value at the end for WHERE clause
    //         values.push(idValue);

    //         const query = format(
    //             "UPDATE %I SET %I WHERE %I = $%I RETURNING *",
    //             tableName,
    //             setClauses,
    //             primaryKey,
    //             values.length,
    //         );
    //         const result = await pool.query(query, values);
    //         res.status(200).json(result.rows[0]);
    //     } catch (err) {
    //         console.error("SQL Error:", err.message);
    //         res.status(500).send(`Error updating table: ${err.message}`);
    //     }
    // });

    router.put("/", async (req, res) => {
        try {
            const { row } = req.body;
            if (!row) return res.status(400).send("row is required");

            const notAllowedTables = ["users"];
            if (notAllowedTables.includes(tblName))
                return res.status(400).send("Invalid table");

            const primaryKey = `id`; // match your DB convention
            const idValue = row[primaryKey];
            if (!idValue)
                return res
                    .status(400)
                    .send(`${primaryKey} is required for update`);

            const filteredRow = Object.fromEntries(
                Object.entries(row).filter(([key]) => key !== primaryKey),
            );

            if (Object.keys(filteredRow).length === 0)
                return res.status(400).send("No fields to update");

            // ✅ Each fragment uses %I for the column name, %s for the $N placeholder
            const setClauses = Object.keys(filteredRow)
                .map((key, i) => format("%I = $%s", key, i + 1))
                .join(", ");

            const values = Object.values(filteredRow);
            values.push(idValue);

            // ✅ setClauses is already safe — spliced in as a literal, not via %I
            //    %s (not %I) for the $N index at the end
            const query = format(
                "UPDATE %I SET " + setClauses + " WHERE %I = $%s RETURNING *",
                tblName, // table name — quoted identifier ✅
                primaryKey, // WHERE column — quoted identifier ✅
                values.length, // $N index — plain number ✅
            );

            const result = await pool.query(query, values);
            if (!result.rows[0]) return res.status(404).send("Row not found");
            res.status(200).json(result.rows[0]);
        } catch (err) {
            console.error("SQL Error:", err.message);
            res.status(500).send(`Error updating table: ${err.message}`);
        }
    });

    router.delete("/:id", async (req, res) => {
        console.log(req.params.id);
        console.log(
            format("DELETE FROM %I WHERE %I = $1 RETURNING *", tblName, "id"),
        );

        try {
            const result = await pool.query(
                format(
                    "DELETE FROM %I WHERE %I = $1 RETURNING *",
                    tblName,
                    "id",
                ),
                [req.params.id],
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ message: "Not found" });
            }

            res.status(200).json(result.rows[0]); // deleted row
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ message: err.message });
        }
    });

    return router;
};
