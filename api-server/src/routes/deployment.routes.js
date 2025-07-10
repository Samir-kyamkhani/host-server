import { Router } from "express";
import { createDeployment } from "../controller/deployment.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create-deployment", authMiddleware, createDeployment);

export default router;
