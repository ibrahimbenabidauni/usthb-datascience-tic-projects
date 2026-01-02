import express from "express";
import pool from "../db/postgres.js";
import { authenticateToken } from "../middleware/auth.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);

// GET all projects
router.get("/", async (req, res) => {
  try {
    const { section, group } = req.query;

    let query = `
      SELECT
        p.id,
        p.title,
        p.description,
        p.section,
        p.group_number,
        p.full_name,
        p.matricule,
        p.drive_link,
        p.created_at,
        u.username AS author_name,
        u.id AS author_id,
        COALESCE(avg_r.rating, 0)::FLOAT as avg_rating,
        COALESCE(avg_r.review_count, 0) as review_count
      FROM projects p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN (
        SELECT project_id, AVG(rating) as rating, COUNT(id) as review_count
        FROM reviews
        GROUP BY project_id
      ) avg_r ON avg_r.project_id = p.id
    `;

    const params = [];
    const conditions = [];

    if (section) {
      conditions.push(`p.section = $${params.length + 1}`);
      params.push(section);
    }
    if (group) {
      conditions.push(`p.group_number = $${params.length + 1}`);
      params.push(group);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY p.created_at DESC";

    const result = await pool.query(query, params);
    const projects = result.rows;
    console.log(`[DEBUG] GET /projects returning ${projects.length} projects`);
    res.json({ projects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load projects" });
  }
});

// GET single project by ID
router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        projects.id,
        projects.title,
        projects.description,
        projects.section,
        projects.group_number,
        projects.full_name,
        projects.matricule,
        projects.drive_link,
        projects.created_at,
        users.username AS author_name,
        users.id AS author_id,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count
      FROM projects
      JOIN users ON users.id = projects.author_id
      LEFT JOIN reviews ON reviews.project_id = projects.id
      WHERE projects.id = $1
      GROUP BY projects.id, users.username, users.id
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch project" });
  }
});

// POST new project
router.post("/", authenticateToken, async (req, res) => {
  console.log('[TRACE] 3. Project Route Handler Start');
  try {
    const { title, description, section, group_number, full_name, matricule, drive_link } = req.body;
    const authorId = req.user.id;
    
    console.log('[TRACE] User ID from Token:', authorId);

    if (!title || !description || !drive_link) {
      return res.status(400).json({ error: "Title, description, and Drive link are required" });
    }
    if (title.length < 3) return res.status(400).json({ error: "Title must be at least 3 characters" });
    if (description.length < 10) return res.status(400).json({ error: "Description must be at least 10 characters" });

    // Basic URL validation
    try {
      new URL(drive_link);
    } catch (e) {
      return res.status(400).json({ error: "Invalid Drive link URL" });
    }

    // Debounce duplicate submissions
    const recentRequest = await pool.query(`
      SELECT id FROM projects 
      WHERE author_id = $1 AND title = $2 AND description = $3 
      AND created_at > NOW() - INTERVAL '30 seconds'
    `, [authorId, title, description]);

    if (recentRequest.rows.length > 0) {
      const existingProject = await pool.query(`
        SELECT p.*, u.username AS author_name
        FROM projects p
        JOIN users u ON u.id = p.author_id
        WHERE p.id = $1
      `, [recentRequest.rows[0].id]);
      
      console.warn(`[POST /projects] Duplicate request detected for author_id: ${authorId}. Returning existing project.`);
      return res.status(201).json({ message: "Project already submitted", project: existingProject.rows[0] });
    }

    // Insert project
    const result = await pool.query(`
      INSERT INTO projects (title, description, author_id, section, group_number, full_name, matricule, drive_link)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [title, description, authorId, section || null, group_number || null, full_name || null, matricule || null, drive_link]);

    const projectId = result.rows[0].id;

    const projectResult = await pool.query(`
      SELECT
        p.*,
        u.username AS author_name
      FROM projects p
      JOIN users u ON u.id = p.author_id
      WHERE p.id = $1
    `, [projectId]);

    const savedProject = projectResult.rows[0];
    console.log('[TRACE] 4. Project Saved Successfully. ID:', savedProject.id);
    
    return res.status(201).json({ 
      message: "Project created successfully", 
      project: savedProject 
    });
  } catch (err) {
    console.error("[POST /projects] FATAL ERROR:", err);
    return res.status(500).json({ error: "Internal Server Error: Failed to save project data" });
  }
});

// PUT update project
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, description, section, group_number, full_name, matricule, drive_link } = req.body;
    const projectId = req.params.id;

    if (!projectId || projectId === "null") return res.status(400).json({ error: "Invalid project ID" });

    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const project = projectResult.rows[0];
    if (project.author_id !== req.user.id) return res.status(403).json({ error: "You can only edit your own projects" });

    await pool.query(`
      UPDATE projects SET title = $1, description = $2, section = $3, group_number = $4, full_name = $5, matricule = $6, drive_link = $7
      WHERE id = $8
    `, [title, description, section, group_number, full_name, matricule, drive_link, projectId]);

    res.json({ message: "Project updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// DELETE project
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const project = projectResult.rows[0];
    if (project.author_id !== req.user.id) return res.status(403).json({ error: "You can only delete your own projects" });

    await pool.query("DELETE FROM reviews WHERE project_id = $1", [projectId]);
    await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);

    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// POST review
router.post("/:id/reviews", authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const projectId = req.params.id;

    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating must be between 1 and 5" });

    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const existingReviewResult = await pool.query(
      "SELECT * FROM reviews WHERE project_id = $1 AND reviewer_id = $2",
      [projectId, req.user.id]
    );

    if (existingReviewResult.rows.length > 0) {
      await pool.query(
        "UPDATE reviews SET rating = $1, comment = $2 WHERE id = $3",
        [rating, comment || null, existingReviewResult.rows[0].id]
      );
      res.json({ message: "Review updated successfully" });
    } else {
      await pool.query(
        "INSERT INTO reviews (project_id, reviewer_id, rating, comment) VALUES ($1, $2, $3, $4)",
        [projectId, req.user.id, rating, comment || null]
      );
      res.status(201).json({ message: "Review added successfully" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add review" });
  }
});

// GET project reviews
router.get("/:id/reviews", async (req, res) => {
  try {
    const projectId = req.params.id;
    const result = await pool.query(`
      SELECT reviews.*, users.username, users.profile_picture
      FROM reviews
      JOIN users ON users.id = reviews.reviewer_id
      WHERE reviews.project_id = $1
      ORDER BY reviews.created_at DESC
    `, [projectId]);

    res.json({ reviews: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

// GET my review
router.get("/:id/my-review", authenticateToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const result = await pool.query(
      "SELECT * FROM reviews WHERE project_id = $1 AND reviewer_id = $2",
      [projectId, req.user.id]
    );
    res.json({ review: result.rows[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch review" });
  }
});

export default router;
