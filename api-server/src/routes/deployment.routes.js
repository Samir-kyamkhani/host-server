import { Router } from "express";
import { createDeployment } from "../controller/deployment.controller.js";
import { getLogs } from "../controller/logs.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();
router.post("/create-deployment", authMiddleware, createDeployment);
router.get("/logs/:id",authMiddleware, getLogs);

export default router;
