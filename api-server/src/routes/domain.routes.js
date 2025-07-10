import { Router } from "express";
import {
  connectDomain,
  verifyDomain,
  removeDomain,
} from "../controller/domain.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/connect", authMiddleware, connectDomain);
router.post("/verify", authMiddleware, verifyDomain);
router.post("/remove", authMiddleware, removeDomain);

export default router;
