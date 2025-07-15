import { Router } from "express";
import {
  addDeploymentLog,
  getLogsByDeployment,
} from "../controller/webhook.controller.js";
import { githubWebhook } from "../controller/github.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/logs", addDeploymentLog);
router.get("/get-logs", authMiddleware, getLogsByDeployment);
router.post("/github", authMiddleware, githubWebhook);

export default router;
