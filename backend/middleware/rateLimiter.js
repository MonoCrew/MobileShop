/**
 * Rate limiter middleware for login attempts to prevent brute-force attacks.
 * Tracks failed attempts per IP address.
 */
const failedAttempts = new Map();

// Configuration: 10 failed attempts allowed in 15 minutes window
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of failedAttempts.entries()) {
    if (now - record.firstAttemptTime > WINDOW_MS) {
      failedAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000);

const loginRateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown_ip";
  const now = Date.now();

  const record = failedAttempts.get(ip);
  if (record) {
    if (now - record.firstAttemptTime > WINDOW_MS) {
      // Window expired, reset
      failedAttempts.delete(ip);
    } else if (record.count >= MAX_FAILED_ATTEMPTS) {
      const remainingSeconds = Math.ceil((record.firstAttemptTime + WINDOW_MS - now) / 1000);
      return res.status(429).json({
        success: false,
        message: `Too many failed login attempts. Please try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
      });
    }
  }

  next();
};

const recordFailedLogin = (req) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown_ip";
  const now = Date.now();
  const record = failedAttempts.get(ip);

  if (!record || now - record.firstAttemptTime > WINDOW_MS) {
    failedAttempts.set(ip, {
      count: 1,
      firstAttemptTime: now,
    });
  } else {
    record.count += 1;
  }
};

const resetLoginAttempts = (req) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown_ip";
  failedAttempts.delete(ip);
};

module.exports = {
  loginRateLimiter,
  recordFailedLogin,
  resetLoginAttempts,
};
