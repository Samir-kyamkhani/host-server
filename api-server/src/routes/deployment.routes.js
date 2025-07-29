import express from 'express';
import {
  createProject,
  getDeploymentStatus,
  getProjectDeployments,
  redeployProject,
  deploymentWebhook,
  healthCheck
} from '../controller/deployment.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Health check endpoint (no authentication required)
router.get('/health', healthCheck);

// Protected routes (require authentication)
router.post('/projects', authMiddleware, createProject);
router.get('/deployments/:deploymentId', authMiddleware, getDeploymentStatus);
router.get('/projects/:projectId/deployments', authMiddleware, getProjectDeployments);
router.post('/projects/:projectId/redeploy', authMiddleware, redeployProject);

// Webhook endpoint (no authentication required)
router.post('/webhook/deployment', deploymentWebhook);

export default router;
