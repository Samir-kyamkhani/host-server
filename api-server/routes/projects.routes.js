import { Router } from "express";
import { createProject } from "../controller/projects.controller.js";
const router = Router();

router.post("/create-project", createProject);

export default router;
