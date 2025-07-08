import { Router } from "express";
import { loginUser, registerUser } from "../controller/auth.controller.js";
import { createSubscription } from "../controller/subscription.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/auth/register", registerUser);
router.post("/auth/login", loginUser);
router.post("/auth/subscribe", authMiddleware, createSubscription);

export default router;
