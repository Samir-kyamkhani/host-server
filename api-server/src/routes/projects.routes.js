import { Router } from "express";
import {
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  updateProject,
} from "../controller/deployment.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { fetchGitHubRepos } from "../controller/github.controller.js";

const router = Router();

// Project management routes
router.post("/", authMiddleware, createProject);
router.get("/", authMiddleware, getProjects);
router.get("/:id", authMiddleware, getProjectById);
router.put("/:id", authMiddleware, updateProject);
router.delete("/:id", authMiddleware, deleteProject);

// GitHub integration
router.get("/github/repos", authMiddleware, fetchGitHubRepos);

export default router;
