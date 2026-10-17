const passport = require("passport");
const { Strategy } = require("passport-local");
const { findForLogin, checkPassword } = require("../services/auth/accounts.js");
const { pool } = require("../services/db.js");

module.exports = function configurePassport() {
    passport.use(
        // "username" may be a username or an email address
        new Strategy(async (identifier, password, done) => {
            try {
                const user = await findForLogin(identifier);
                // checkPassword runs bcrypt even for unknown users (constant timing)
                if (!(await checkPassword(user, password)))
                    return done(null, false, { message: "Incorrect username or password." });
                delete user.password;
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
