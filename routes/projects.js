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

const uploadDir = path.join(__dirname, "..", "public", "uploads");

// Only create directory on non-Vercel environments
if (!process.env.VERCEL && !fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.warn("Could not create upload directory:", err.message);
  }
}

// Multer configuration: memory storage for Vercel
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Multer error middleware
const handleFileUpload = (req, res, next) => {
  console.log('[TRACE] 2. Multer Middleware Start');
  console.log('[TRACE] Content-Type:', req.headers['content-type']);
  
  upload.array("files", 5)(req, res, (err) => {
    if (err) {
      console.error("[TRACE] Multer Error:", err.message);
      return res.status(400).json({ error: "File upload failed: " + err.message });
    }
    console.log('[TRACE] 2. Multer Middleware Finish. Files received:', req.files ? req.files.length : 0);
    next();
  });
};

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
        p.created_at,
        u.username AS author_name,
        u.id AS author_id,
        COALESCE(avg_r.rating, 0)::FLOAT as avg_rating,
        COALESCE(avg_r.review_count, 0) as review_count,
        f.files
      FROM projects p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN (
        SELECT project_id, JSONB_AGG(JSONB_BUILD_OBJECT('file_path', file_path, 'file_type', file_type, 'original_name', original_name)) as files
        FROM project_files
        GROUP BY project_id
      ) f ON f.project_id = p.id
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
    res.json({ projects: result.rows });
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
        projects.created_at,
        users.username AS author_name,
        users.id AS author_id,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count,
        f.files
      FROM projects
      JOIN users ON users.id = projects.author_id
      LEFT JOIN reviews ON reviews.project_id = projects.id
      LEFT JOIN (
        SELECT project_id, JSONB_AGG(JSONB_BUILD_OBJECT('file_path', file_path, 'file_type', file_type, 'original_name', original_name)) as files
        FROM project_files
        GROUP BY project_id
      ) f ON f.project_id = projects.id
      WHERE projects.id = $1
      GROUP BY projects.id, users.username, users.id, f.files
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
router.post("/", authenticateToken, handleFileUpload, async (req, res) => {
  console.log('[TRACE] 3. Project Route Handler Start');
  try {
    const { title, description, section, group_number, full_name, matricule } = req.body;
    const authorId = req.user.id;
    
    console.log('[TRACE] User ID from Token:', authorId);
    console.log('[TRACE] Body keys after Multer:', Object.keys(req.body || {}));

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }
    if (title.length < 3) return res.status(400).json({ error: "Title must be at least 3 characters" });
    if (description.length < 10) return res.status(400).json({ error: "Description must be at least 10 characters" });

    // Debounce duplicate submissions
    const recentRequest = await pool.query(`
      SELECT id FROM projects 
      WHERE author_id = $1 AND title = $2 AND description = $3 
      AND created_at > NOW() - INTERVAL '30 seconds'
    `, [authorId, title, description]);

    if (recentRequest.rows.length > 0) {
      // If we found a recent submission, check if it was actually successful
      // For now, let's just return the existing project to the user instead of an error
      // to handle the double-submission gracefully
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
      INSERT INTO projects (title, description, author_id, section, group_number, full_name, matricule)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [title, description, authorId, section || null, group_number || null, full_name || null, matricule || null]);

    const projectId = result.rows[0].id;

    // Handle uploaded files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        const fileName = "project-" + uniqueName + ext;
        const filePath = `/uploads/${fileName}`;
        const fullPath = path.join(uploadDir, fileName);

        try {
          // Only write to disk if not Vercel
          if (!process.env.VERCEL) fs.writeFileSync(fullPath, file.buffer);

          // SAFE INSERT: Check columns first or use simplified insert if schema is stubborn
          await pool.query(
            `INSERT INTO project_files (project_id, file_path, file_type, file_size, original_name) VALUES ($1, $2, $3, $4, $5)`,
            [projectId, filePath, file.mimetype, file.size, file.originalname]
          );

          console.log(`[POST /projects] Saved file: ${file.originalname} for project_id: ${projectId}`);
        } catch (fsErr) {
          console.error("[POST /projects] File save error:", fsErr);
          // Fallback to minimal insert if extended columns fail
          try {
             await pool.query(
              `INSERT INTO project_files (project_id, file_path) VALUES ($1, $2)`,
              [projectId, filePath]
            );
          } catch (retryErr) {
            console.error("[POST /projects] Fallback file save error:", retryErr);
          }
        }
      }
    }

    const projectResult = await pool.query(`
      SELECT
        p.*,
        u.username AS author_name,
        COALESCE(
          (SELECT JSON_AGG(JSON_BUILD_OBJECT('file_path', file_path, 'file_type', file_type, 'original_name', original_name))
           FROM project_files
           WHERE project_id = p.id),
          '[]'::json
        ) as files
      FROM projects p
      JOIN users u ON u.id = p.author_id
      WHERE p.id = $1
    `, [projectId]);

    res.status(201).json({ message: "Project created successfully", project: projectResult.rows[0] });
  } catch (err) {
    console.error("[POST /projects] Error:", err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PUT update project
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, description, section, group_number, full_name, matricule } = req.body;
    const projectId = req.params.id;

    if (!projectId || projectId === "null") return res.status(400).json({ error: "Invalid project ID" });

    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const project = projectResult.rows[0];
    if (project.author_id !== req.user.id) return res.status(403).json({ error: "You can only edit your own projects" });

    await pool.query(`
      UPDATE projects SET title = $1, description = $2, section = $3, group_number = $4, full_name = $5, matricule = $6
      WHERE id = $7
    `, [title, description, section, group_number, full_name, matricule, projectId]);

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
    await pool.query("DELETE FROM project_files WHERE project_id = $1", [projectId]);
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
