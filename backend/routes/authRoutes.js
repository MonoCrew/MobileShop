const express = require("express");
const passport = require("passport");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { requireAuth } = require("../middleware/auth");
const {
  loginRateLimiter,
  recordFailedLogin,
  resetLoginAttempts,
} = require("../middleware/rateLimiter");

const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticates user with .env credentials and establishes session
 */
router.post("/login", loginRateLimiter, (req, res, next) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      recordFailedLogin(req);
      return res.status(401).json({
        success: false,
        message: info && info.message ? info.message : "Invalid email or password",
      });
    }

    // Reset failed login tracking on success
    resetLoginAttempts(req);

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        return next(regenErr);
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }

        return res.json({
          success: true,
          authenticated: true,
          user: {
            id: user._id,
            email: user.email,
            role: user.role,
          },
        });
      });
    });
  })(req, res, next);
});

/**
 * GET /api/auth/me
 * Checks the current session authentication status and returns user profile
 */
router.get("/me", (req, res) => {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }

  return res.json({
    success: true,
    authenticated: false,
  });
});

/**
 * POST /api/auth/logout
 * Destroys session, clears session cookie, and logs user out
 */
router.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    if (req.session) {
      req.session.destroy((destroyErr) => {
        res.clearCookie("pos_sid");
        if (destroyErr) {
          return next(destroyErr);
        }
        return res.json({
          success: true,
          message: "Logged out successfully",
        });
      });
    } else {
      res.clearCookie("pos_sid");
      return res.json({
        success: true,
        message: "Logged out successfully",
      });
    }
  });
});

/**
 * POST /api/auth/change-password
 * Changes the authenticated user's password with old password verification and bcrypt hashing
 */
router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password, new password, and confirm new password are required.",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long.",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "New password and confirmation do not match.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    // Verify current / old password
    const isOldValid = await user.verifyCandidatePassword(oldPassword);
    if (!isOldValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Hash the new password before storing it
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.isPasswordUpdated = true;
    user.passwordUpdatedAt = new Date();
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully. Future logins will use your new password.",
    });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/auth/verify-password
 * Verifies entered password against the authenticated user's current active password
 */
router.post("/verify-password", requireAuth, async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Password is required.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
      });
    }

    const isMatch = await user.verifyCandidatePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        verified: false,
        message: "Incorrect password. Please try again.",
      });
    }

    return res.json({
      success: true,
      verified: true,
      message: "Password verified.",
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
