import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { fetchGitHubRepos } from "../controller/github.controller.js";

const router = Router();
router.get("/repos", authMiddleware, fetchGitHubRepos);

export default router;
