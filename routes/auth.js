import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/postgres.js";

const router = express.Router();

/**
 * ---------------------------------------------------------
 * JWT CONFIGURATION & UTILITIES
 * ---------------------------------------------------------
 */

// Safely export JWT_SECRET with fallback for local dev/missing env
export const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';
const OLD_SECRET = 'tic-projects-platform-secret-key-2025';

/**
 * Robust Token Generation
 * - payload: Object containing user data (id, username, etc.)
 * - expiresIn: Default to 7 days for better user experience
 */
export const generateToken = (payload, expiresIn = '7d') => {
  try {
    console.log(`[JWT] Generating token for user: ${payload.username || payload.id}`);
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  } catch (error) {
    console.error(`[JWT] Error generating token:`, error);
    throw new Error("Token generation failed");
  }
};

/**
 * Robust Authentication Middleware
 * - Works both as local middleware and compatible with serverless
 * - Handles secret rotation (Old/New)
 * - Logs detailed debugging info without crashing
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log("[AUTH] No token received in request headers");
    return res.status(401).json({ error: "No token provided", code: "MISSING_TOKEN" });
  }

  let decoded = null;
  let errorReason = null;

  // Attempt verification with all available secrets (New Secret first, then Fallback)
  const secrets = [JWT_SECRET, OLD_SECRET];
  
  for (let i = 0; i < secrets.length; i++) {
    const currentSecret = secrets[i];
    const secretType = i === 0 ? "NEW_ENV_SECRET" : "OLD_FALLBACK_SECRET";

    try {
      decoded = jwt.verify(token, currentSecret);
      console.log(`[AUTH] Token successfully verified using ${secretType}. Decoded user:`, decoded.username || decoded.id);
      break; // Stop loop once verified
    } catch (err) {
      errorReason = err;
      console.log(`[AUTH] Verification attempt failed with ${secretType}: ${err.message}`);
    }
  }

  if (decoded) {
    req.user = decoded;
    return next();
  }

  // Handle specific JWT error cases for better frontend feedback
  if (errorReason && errorReason.name === 'TokenExpiredError') {
    console.warn(`[AUTH] Token expired at: ${errorReason.expiredAt}`);
    return res.status(401).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
  }

  console.error("[AUTH] All verification attempts failed. Final error:", errorReason?.message || "Invalid token");
  return res.status(403).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
};

/**
 * ---------------------------------------------------------
 * AUTH ROUTES
 * ---------------------------------------------------------
 */

// Registration
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id",
      [username, email, hashedPassword]
    );

    const userId = result.rows[0].id;
    const token = generateToken({ id: userId, username, email });

    res.status(201).json({
      message: "Registration successful",
      token,
      user: { id: userId, username, email }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed", message: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR username = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email/username or password" });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email/username or password" });
    }

    const token = generateToken({ id: user.id, username: user.username, email: user.email });

    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// Get current user info (Using robust middleware)
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Server error during profile fetch" });
  }
});

// Change password (Using robust middleware)
router.post("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = userResult.rows[0];

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashedPassword, req.user.id]);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password." });
  }
});

export default router;
