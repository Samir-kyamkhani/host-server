import { Router } from "express";
import {
  createProject,
  getProjectById,
  getProjects,
  resolveDomain,
  updateProject,
} from "../controller/project.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create", authMiddleware, createProject);
router.get("/get-projects", authMiddleware, getProjects);
router.get("/get-project/:id", authMiddleware, getProjectById);
router.put("/update/:id", authMiddleware, updateProject);
router.delete("/delete/:id", authMiddleware, deleteProject);
// For proxy server (no auth required)

router.get("/resolve", resolveDomain);

export default router;
