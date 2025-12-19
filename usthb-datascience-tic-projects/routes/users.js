import express from "express";
import pool from "../db/postgres.js";
import { authenticateToken } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, "..", "public", "uploads", "avatars");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "avatar-" + uniqueName + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const result = await pool.query(`
      SELECT id, username, full_name, profile_picture, bio, created_at
      FROM users
      WHERE username ILIKE $1 OR full_name ILIKE $1
      LIMIT 20
    `, [`%${q}%`]);

    res.json({ users: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search users" });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, full_name, profile_picture, bio, created_at
      FROM users WHERE id = $1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.put("/me", authenticateToken, upload.single("profile_picture"), async (req, res) => {
  try {
    const { username, full_name, bio } = req.body;

    const currentUserResult = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = currentUserResult.rows[0];

    if (username && username !== currentUser.username) {
      const existingResult = await pool.query(
        "SELECT id FROM users WHERE username = $1 AND id != $2",
        [username, req.user.id]
      );
      if (existingResult.rows.length > 0) {
        return res.status(400).json({ error: "Username already taken" });
      }
    }

    let profilePicture = currentUser.profile_picture;
    if (req.file) {
      profilePicture = `/uploads/avatars/${req.file.filename}`;
    }

    await pool.query(`
      UPDATE users SET username = $1, full_name = $2, bio = $3, profile_picture = $4
      WHERE id = $5
    `, [
      username || currentUser.username,
      full_name || currentUser.full_name,
      bio || currentUser.bio,
      profilePicture,
      req.user.id
    ]);

    const updatedResult = await pool.query(`
      SELECT id, username, email, full_name, profile_picture, bio, created_at
      FROM users WHERE id = $1
    `, [req.user.id]);

    res.json({ message: "Profile updated successfully", user: updatedResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const userResult = await pool.query(`
      SELECT id, username, full_name, profile_picture, bio, created_at
      FROM users WHERE id = $1
    `, [req.params.id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const projectsResult = await pool.query(`
      SELECT projects.*, project_files.file_path,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count
      FROM projects
      LEFT JOIN project_files ON project_files.project_id = projects.id
      LEFT JOIN reviews ON reviews.project_id = projects.id
      WHERE projects.author_id = $1
      GROUP BY projects.id, project_files.file_path
      ORDER BY projects.created_at DESC
    `, [req.params.id]);

    res.json({ user: userResult.rows[0], projects: projectsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;
