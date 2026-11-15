/**
 * Middleware to require authentication on protected routes.
 * Rejects unauthenticated requests with a 401 Unauthorized status.
 */
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Authentication required",
  });
};

/**
 * Middleware to require administrator privileges.
 * Rejects unauthorized users with a 403 Forbidden status.
 */
const requireAdmin = (req, res, next) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  if (req.user && req.user.role === "admin") {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: "Admin authorization required",
  });
};

module.exports = {
  requireAuth,
  requireAdmin,
};

