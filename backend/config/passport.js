const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const User = require("../models/User");

// Setup Passport Local Strategy
passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: false,
    },
    async (email, password, done) => {
      try {
        const configuredEmail = (process.env.AUTH_EMAIL || "hamzanazir780@gmail.com").trim().toLowerCase();
        const configuredPassword = process.env.AUTH_PASSWORD || "12345678";
        const normalizedInputEmail = (email || "").trim().toLowerCase();

        if (!normalizedInputEmail || !password) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Only allow configured admin credentials (single user entry enforcement)
        if (normalizedInputEmail !== configuredEmail) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Find single admin user in MongoDB
        let user = await User.findOne({ email: configuredEmail });

        if (!user) {
          if (password === configuredPassword) {
            try {
              const hashedPassword = await bcrypt.hash(configuredPassword, 10);
              user = await User.create({
                email: configuredEmail,
                password: hashedPassword,
                role: "admin",
                isPasswordUpdated: false,
              });
              await User.deleteMany({ _id: { $ne: user._id } });
              return done(null, user);
            } catch (createErr) {
              user = await User.findOne({ email: configuredEmail });
              if (!user) return done(createErr);
            }
          } else {
            return done(null, false, { message: "Invalid email or password" });
          }
        }

        // Verify password against stored hash or fallback
        const isValidPassword = await user.verifyCandidatePassword(password);
        if (!isValidPassword) {
          return done(null, false, { message: "Invalid email or password" });
        }

        // Keep DB hash synchronized if configured password is used
        if (configuredPassword && password === configuredPassword) {
          const isHashMatching = await user.comparePassword(configuredPassword);
          if (!isHashMatching) {
            user.password = await bcrypt.hash(configuredPassword, 10);
            await user.save();
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Serialize user ID to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select("-password");
    if (!user) {
      return done(null, false);
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
});

module.exports = passport;
