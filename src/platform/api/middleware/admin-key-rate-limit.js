const rateMap = new Map();

function getKey(req) {
  return req.get("x-booking-admin-key") || "";
}

function cleanupOldEntries(limitMs) {
  const now = Date.now();
  for (const [key, entry] of rateMap.entries()) {
    if (now - entry.windowStart > limitMs * 2) {
      rateMap.delete(key);
    }
  }
}

function adminKeyRateLimit(req, res, next) {
  const windowMs = parseInt(process.env.BOOKING_TOOL_ADMIN_RATE_WINDOW_MS, 10) || 60_000;
  const maxRequests = parseInt(process.env.BOOKING_TOOL_ADMIN_RATE_MAX, 10) || 10;
  const key = getKey(req);
  const now = Date.now();

  if (!key) {
    return res.sendStatus(401);
  }

  let entry = rateMap.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { count: 0, windowStart: now };
  }

  entry.count += 1;
  rateMap.set(key, entry);

  if (entry.count > maxRequests) {
    return res.status(429).send("Too many requests");
  }

  cleanupOldEntries(windowMs);
  next();
}

module.exports = adminKeyRateLimit;
