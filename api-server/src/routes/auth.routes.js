import { Router } from "express";
import { getCurrentUser, loginUser, registerUser } from "../controller/auth.controller.js";
import { createSubscription } from "../controller/subscription.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/get-current-user", authMiddleware, getCurrentUser);
router.post("/subscribe", authMiddleware, createSubscription);

export default router;
