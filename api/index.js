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

app.use(express.static(path.join(__dirname, "../public")));

app.get("/api", (req, res) => {
  res.json({ message: "TIC Projects Platform API is running", version: "1.0.0" });
});

import authRoutes from "../routes/auth.js";
import projectRoutes from "../routes/projects.js";
import userRoutes from "../routes/users.js";

app.use("/auth", authRoutes);
app.use("/projects", projectRoutes);
app.use("/users", userRoutes);

app.get("/{*splat}", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/auth") && !req.path.startsWith("/projects") && !req.path.startsWith("/users")) {
    res.sendFile(path.join(__dirname, "../public", "index.html"));
  }
});

// Error handler for all routes
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message 
  });
});

export default app;
