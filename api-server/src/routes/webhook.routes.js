import { Router } from "express";
import { deploymentWebhook } from "../controller/webhook.controller.js";
import { githubWebhook } from "../controller/github.controller.js";

const router = Router();
router.post("/deployment", deploymentWebhook);
router.post("/github", githubWebhook);

export default router;