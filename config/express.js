module.exports = (express, app) => {
    const cors = require("cors");
    const path = require("path");
    const helmet = require("helmet");
    const hpp = require("hpp");
    const rateLimit = require("express-rate-limit");
    const pinoHttp = require("pino-http");
    const session = require("express-session");
    const passport = require("passport");
    const logger = require("./logger.js");
    const { insertLog } = require("../services/app/logs.js");
    const configurePassport = require("./passport.js");
    const router = require("../routes");

    const isProd = process.env.NODE_ENV === "production";
    const { authenticate } = require("./auth.js");

    // Behind a hosting proxy (Render, Railway, Fly, Heroku, Nginx…) Express must
    // trust it, otherwise every visitor shares the proxy's IP: the login rate
    // limit then blocks EVERYONE after 20 attempts, and secure cookies break.
    // TRUST_PROXY = number of proxy hops (usually 1).
    if (process.env.TRUST_PROXY) {
        const hops = Number(process.env.TRUST_PROXY);
        app.set(
            "trust proxy",
            Number.isNaN(hops) ? process.env.TRUST_PROXY : hops,
        );
    }

    // CORS_ORIGIN may list several origins separated by commas
    const allowedOrigins = process.env.CORS_ORIGIN || "http://localhost:9000";

    app.use(helmet());
    app.use(pinoHttp({ logger }));
    app.use(
        cors({
            origin: (origin, callback) =>
                callback(null, !origin || allowedOrigins === origin),
            credentials: true,
            allowedHeaders: [
                "Content-Type",
                "Authorization",
                "x-auth-token",
                "x-uid",
                "x-watched",
            ],
        }),
    );
    app.use(express.json({ limit: "1mb" }));
    app.use(express.urlencoded({ extended: true }));
    app.use(hpp());

    // Persist a row per request into public.logs; failures never affect the response
    app.use((req, res, next) => {
        const startedAt = process.hrtime.bigint();
        res.on("finish", () => {
            const responseTimeMs = Number(
                (process.hrtime.bigint() - startedAt) / 1000000n,
            );
            const level =
                res.statusCode >= 500
                    ? "error"
                    : res.statusCode >= 400
                      ? "warn"
                      : "info";
            insertLog({
                level,
                message: `${req.method} ${req.originalUrl}`,
                method: req.method,
                path: req.originalUrl,
                status_code: res.statusCode,
                response_time_ms: responseTimeMs,
                ip: req.ip,
                user_id: req.auth?.id ?? req.user?.id ?? null,
            }).catch((err) => logger.error({ err }, "Failed to persist log"));
        });
        next();
    });

    // Limit repeated requests to auth endpoints to slow down brute-force attempts
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: true,
        legacyHeaders: false,
    });

    // Broader limit for the rest of the API
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 500,
        standardHeaders: true,
        legacyHeaders: false,
    });

    app.use(
        session({
            secret: process.env.SESSION_SECRET_KEY,
            resave: false,
            saveUninitialized: false,
            cookie: { secure: isProd, httpOnly: true, sameSite: "lax" },
        }),
    );

    app.use(passport.initialize());
    app.use(passport.session());
    configurePassport();

    // Verify the token on every request; sets req.auth and a trusted x-uid
    app.use("/api", authenticate);

    app.use("/api/register", authLimiter);
    app.use("/api/login", authLimiter);
    app.use("/api", apiLimiter, router);

    // // ----------- FRONTEND -----------
    // app.use(express.static(path.join(__dirname, "frontend/dist/spa")));
};
