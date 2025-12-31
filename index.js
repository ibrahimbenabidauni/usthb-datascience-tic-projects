import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/api", (req, res) => {
  res.json({ message: "TIC Projects Platform API is running", version: "1.0.0" });
});

import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import userRoutes from "./routes/users.js";

app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);
app.use("/users", userRoutes);

import pool from "./db/postgres.js";

app.get("/uploads/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = `/uploads/${filename}`;
    
    const result = await pool.query(
      "SELECT file_data, file_type, original_name FROM project_files WHERE file_path = $1",
      [filePath]
    );

    if (result.rows.length > 0 && result.rows[0].file_data) {
      const file = result.rows[0];
      res.set("Content-Type", file.file_type || "application/octet-stream");
      res.set("Content-Disposition", `inline; filename="${file.original_name || filename}"`);
      return res.send(file.file_data);
    }

    // Fallback to local disk if data not in DB (for non-Vercel local dev)
    const localPath = path.join(__dirname, "public", "uploads", filename);
    res.sendFile(localPath, (err) => {
      if (err) {
        console.error(`[ERROR] File not found in DB or Disk: ${localPath}`);
        res.status(404).json({ error: "File not found" });
      }
    });
  } catch (err) {
    console.error("[ERROR] File serving crash:", err);
    res.status(500).json({ error: "Internal server error serving file" });
  }
});

app.get("/{*splat}", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/auth") && !req.path.startsWith("/projects") && !req.path.startsWith("/users")) {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

const PORT = process.env.PORT || 5000;

// Only listen if not in Vercel environment
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend: http://localhost:${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
  });
}

export default app;
