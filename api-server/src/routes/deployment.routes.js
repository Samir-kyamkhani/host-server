import { Router } from "express";
import {
  createDeployment,
  deleteDeployment,
  getAllDeployments,
  updateDeployment,
} from "../controller/deployment.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/create-deployment", authMiddleware, createDeployment);
router.get("/", authMiddleware, getAllDeployments);
router.get("/:id", authMiddleware, getDeploymentById);
router.put("/update/:id", authMiddleware, updateDeployment);
router.delete("/delete/:id", authMiddleware, deleteDeployment);

export default router;
