import { Router } from "express";
import { createProject, getProjects, resolveDomain, updateProject } from "../controller/project.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create", authMiddleware, createProject);
router.get("/projects", authMiddleware, getProjects);
router.put("/update/:id", authMiddleware, updateProject);
// For proxy server (no auth required)
router.get("/resolve", resolveDomain);

export default router;
