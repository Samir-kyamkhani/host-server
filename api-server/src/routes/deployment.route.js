import { Router } from "express";
const router = Router();

router.post("/create-deploy", createDeployment);

export default router;