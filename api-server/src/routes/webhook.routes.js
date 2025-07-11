import { Router } from "express";
import { deploymentWebhook } from "../controller/webhook.controller.js";
import { githubWebhook } from "../controller/github.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();
router.post("/deployment", authMiddleware, deploymentWebhook);
router.post("/github", authMiddleware, githubWebhook);

export default router;