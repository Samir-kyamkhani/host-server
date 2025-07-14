import { Router } from "express";
import { addDeploymentLog } from "../controller/webhook.controller.js";
import { githubWebhook } from "../controller/github.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/logs",  addDeploymentLog);
router.post("/github", authMiddleware, githubWebhook);

export default router;