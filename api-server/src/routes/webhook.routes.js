import { Router } from "express";
import {
  addDeploymentLog,
  getLogsByDeployment,
} from "../controller/webhook.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// Deployment logs
router.post("/logs", addDeploymentLog);
router.get("/logs/:id", authMiddleware, getLogsByDeployment);

export default router;
