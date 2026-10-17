const passport = require("passport");
const { Strategy } = require("passport-local");
const bcrypt = require("bcrypt");
const { pool } = require("../services/db.js");

module.exports = function configurePassport() {
    passport.use(
        new Strategy(async (username, password, done) => {
            try {
                const result = await pool.query(
                    "SELECT userid, username, password, admin, avatar, uid FROM users WHERE username = $1 AND deleted = FALSE",
                    [username],
                );
                const user = result.rows[0];

                const generic = { message: "Incorrect username or password." };
                if (!user) return done(null, false, generic);

                const match = await bcrypt.compare(password, user.password);
                if (!match) return done(null, false, generic);

                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }),
    );

    passport.serializeUser((user, done) => {
        done(null, user.userid);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const result = await pool.query(
                "SELECT userid, username, admin, avatar, uid FROM users WHERE userid = $1 AND deleted = FALSE",
                [id],
            );
            done(null, result.rows[0]);
        } catch (err) {
            done(err);
        }
    });
};
