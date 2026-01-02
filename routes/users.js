import express from "express";
import pool from "../db/postgres.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

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

router.put("/me", authenticateToken, async (req, res) => {
  try {
    const { username, full_name, bio, profile_picture } = req.body;

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

    await pool.query(`
      UPDATE users SET username = $1, full_name = $2, bio = $3, profile_picture = $4
      WHERE id = $5
    `, [
      username || currentUser.username,
      full_name || currentUser.full_name,
      bio || currentUser.bio,
      profile_picture || currentUser.profile_picture,
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
      SELECT projects.*,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count
      FROM projects
      LEFT JOIN reviews ON reviews.project_id = projects.id
      WHERE projects.author_id = $1
      GROUP BY projects.id
      ORDER BY projects.created_at DESC
    `, [req.params.id]);

    res.json({ user: userResult.rows[0], projects: projectsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

export default router;