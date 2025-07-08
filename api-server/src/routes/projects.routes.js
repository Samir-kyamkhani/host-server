import {Router} from "express";
import { createProject, getProjects } from "../controller/project.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();
router.post("/create", authMiddleware, createProject);  
router.get("/projects",authMiddleware, getProjects);
export default router;
