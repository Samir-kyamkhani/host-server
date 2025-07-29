import { Router } from "express";
import {
  getCurrentUser,
  githubConnect,
  loginUser,
  logoutUser,
  registerUser,
} from "../controller/auth.controller.js";
import { createSubscription, getSubscription } from "../controller/subscription.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

// Authentication routes
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", authMiddleware, logoutUser);
router.get("/profile", authMiddleware, getCurrentUser);

// GitHub integration
router.post("/github-connect", authMiddleware, githubConnect);

// Subscription routes
router.post("/subscribe", authMiddleware, createSubscription);
router.get("/subscription", authMiddleware, getSubscription);

export default router;
