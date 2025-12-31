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

// Multer configuration with error handling for serverless environments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "project-" + uniqueName + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // Increased to 50MB for videos
});

// Middleware to handle multer errors gracefully on serverless platforms
const handleFileUpload = (req, res, next) => {
  upload.array("files", 5)(req, res, (err) => {
    if (err) {
      // On Vercel or if upload fails, just proceed without the files
      console.warn("File upload skipped:", err.message);
      req.files = [];
    }
    next();
  });
};

router.get("/", async (req, res) => {
  try {
    const { section, group } = req.query;
    
    let query = `
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
        project_files.file_path,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count
      FROM projects
      JOIN users ON users.id = projects.author_id
      LEFT JOIN project_files ON project_files.project_id = projects.id
      LEFT JOIN reviews ON reviews.project_id = projects.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (section) {
      conditions.push(`projects.section = $${params.length + 1}`);
      params.push(section);
    }
    if (group) {
      conditions.push(`projects.group_number = $${params.length + 1}`);
      params.push(group);
    }
    
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    
    query += " GROUP BY projects.id, users.username, users.id, project_files.file_path ORDER BY projects.created_at DESC";
    
    const result = await pool.query(query, params);
    res.json({ projects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load projects" });
  }
});

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
        project_files.file_path,
        COALESCE(AVG(reviews.rating), 0)::FLOAT as avg_rating,
        COUNT(reviews.id) as review_count
      FROM projects
      JOIN users ON users.id = projects.author_id
      LEFT JOIN project_files ON project_files.project_id = projects.id
      LEFT JOIN reviews ON reviews.project_id = projects.id
      WHERE projects.id = $1
      GROUP BY projects.id, users.username, users.id, project_files.file_path
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

router.post("/", authenticateToken, handleFileUpload, async (req, res) => {
  try {
    const { title, description, section, group_number, full_name, matricule } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    if (title.length < 3) {
      return res.status(400).json({ error: "Title must be at least 3 characters" });
    }

    if (description.length < 10) {
      return res.status(400).json({ error: "Description must be at least 10 characters" });
    }

    const result = await pool.query(`
      INSERT INTO projects (title, description, author_id, section, group_number, full_name, matricule)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [title, description, req.user.id, section || null, group_number || null, full_name || null, matricule || null]);

    const projectId = result.rows[0].id;

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const filePath = `/uploads/${file.filename}`;
        const fileType = file.mimetype;
        const fileSize = file.size;
        await pool.query(
          `INSERT INTO project_files (project_id, file_path, file_type, file_size) VALUES ($1, $2, $3, $4)`,
          [projectId, filePath, fileType, fileSize]
        );
      }
    }

    const projectResult = await pool.query(`
      SELECT projects.*, users.username AS author_name, 
             JSON_AGG(JSON_BUILD_OBJECT('file_path', project_files.file_path, 'file_type', project_files.file_type)) as files
      FROM projects
      JOIN users ON users.id = projects.author_id
      LEFT JOIN project_files ON project_files.project_id = projects.id
      WHERE projects.id = $1
      GROUP BY projects.id, users.username
    `, [projectId]);

    res.status(201).json({ message: "Project created successfully", project: projectResult.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  }
});

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, description, section, group_number, full_name, matricule } = req.body;
    const projectId = req.params.id;

    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];

    if (project.author_id !== req.user.id) {
      return res.status(403).json({ error: "You can only edit your own projects" });
    }

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

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const projectId = req.params.id;
    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];

    if (project.author_id !== req.user.id) {
      return res.status(403).json({ error: "You can only delete your own projects" });
    }

    await pool.query("DELETE FROM reviews WHERE project_id = $1", [projectId]);
    await pool.query("DELETE FROM project_files WHERE project_id = $1", [projectId]);
    await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);

    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

router.post("/:id/reviews", authenticateToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const projectId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const projectResult = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

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
