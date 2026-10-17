/**
 * Expected, user-facing errors (bad input, not enough balance…) carry an
 * HTTP status and a machine-readable code. Anything else is a real failure
 * and is reported to the client as a generic 500 without internals.
 */
class AppError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.expose = true;
    }
}

/** Send an error response; logs unexpected errors. `error` kept for older clients. */
function sendError(res, err, context = "") {
    if (err instanceof AppError)
        return res.status(err.status).json({ code: err.code, error: err.message, message: err.message });
    console.error(`[error]${context ? ` ${context}` : ""}`, err);
    return res.status(500).json({ code: "SERVER_ERROR", error: "Server error", message: "Server error" });
}

module.exports = { AppError, sendError };
