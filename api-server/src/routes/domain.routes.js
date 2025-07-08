import { Router } from "express";
import {
  connectDomain,
  removeDomain,
} from "../controller/domain.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { resolveDomain } from "../controller/project.controller.js";

const router = Router();

router.get("/projects/resolve", authMiddleware, resolveDomain);
router.post("/connect-domain", authMiddleware, connectDomain);
router.post("/verify-domain", authMiddleware, verifyDomain);

router.post("/remove-domain", authMiddleware, removeDomain);

export default router;
