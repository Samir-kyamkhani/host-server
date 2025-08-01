import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { validateDeploymentRequest, generateUniqueSubdomain } from '../utils/deploymentValidator.js';
import { triggerAWSBuilder, verifyWebhookSignature } from '../utils/awsTrigger.js';
import { notificationService } from '../services/notificationService.js';

const prisma = new PrismaClient();

// Create new project and trigger deployment
const createProject = asyncHandler(async (req, res) => {
  try {
    const { name, gitUrl, envVars, db, framework } = req.body;
    const userId = req.user.id;

    // Validate request
    const validation = validateDeploymentRequest(req.body);
    if (!validation.isValid) {
      return ApiError.send(res, 400, validation.errors.join(', '));
    }

    // Check user subscription limits
    const userSubscription = await prisma.subscription.findUnique({
      where: { userId }
    });

    const projectCount = await prisma.project.count({
      where: { userId }
    });

    // Default to FREE plan if no subscription exists
    const userPlan = userSubscription?.plan || 'FREE';

    if (userPlan === 'FREE' && projectCount >= 2) {
      return ApiError.send(res, 403, 'Free plan limited to 2 project. Upgrade to create more projects.');
    }

    if (userPlan === 'STARTER' && projectCount >= 5) {
      return ApiError.send(res, 403, 'Starter plan limited to 5 projects. Upgrade to create more projects.');
    }

    // Check if Git URL already exists
    const existingProject = await prisma.project.findUnique({
      where: { gitUrl }
  });

    if (existingProject) {
      return ApiError.send(res, 400, 'A project with this Git URL already exists. Please use a different repository.');
    }

    // Generate unique subdomain
    const subdomain = await generateUniqueSubdomain(name);

    // Create project in database
    const project = await prisma.project.create({
      data: {
        name,
        gitUrl,
        framework,
        subdomain,
        userId
      }
    });

    // Create initial deployment record
    const deployment = await prisma.deployment.create({
    data: {
        projectId: project.id,
        status: 'QUEUED'
      }
    });

    // Prepare deployment configuration
    const deploymentConfig = {
      name,
      gitUrl,
      envVars: [
        ...(envVars || []),
        {
          key: 'API_SERVER_URL',
          value: process.env.API_BASE_URL
        },
        {
          key: 'API_KEY',
          value: process.env.BUILDER_API_KEY
        }
      ],
      db,
      framework
    };

    // Trigger AWS builder server
    const triggerResult = await triggerAWSBuilder({
      projectId: project.id,
      deploymentId: deployment.id,
      subdomain,
      deploymentConfig
    });

    if (!triggerResult.success) {
      // Update deployment status to failed
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'FAILED' }
      });

      return ApiError.send(res, 500, 'Failed to trigger deployment', triggerResult.error);
    }

    // Log initial deployment log
    await prisma.deploymentLog.create({
      data: {
        deploymentId: deployment.id,
        projectId: project.id,
        log: '🚀 Deployment triggered successfully'
      }
    });

    // Send notification to user
    // await notificationService.sendDeploymentStarted({
    //   userId,
    //   projectName: name,
    //   deploymentId: deployment.id
    // });

    return res.status(201).json(
      ApiResponse.success(
        {
          project: {
            id: project.id,
            name: project.name,
            subdomain: project.subdomain,
            framework: project.framework,
            gitUrl: project.gitUrl,
            createdAt: project.createdAt
          },
          deployment: {
            id: deployment.id,
            status: deployment.status,
            createdAt: deployment.createdAt
          }
        },
        'Project created and deployment started',
        201
      )
    );

  } catch (error) {
    console.error('Create project error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('git_url')) {
        return ApiError.send(res, 400, 'A project with this Git URL already exists. Please use a different repository.');
      }
      if (error.meta?.target?.includes('subdomain')) {
        return ApiError.send(res, 400, 'A project with this subdomain already exists. Please try a different project name.');
      }
      return ApiError.send(res, 400, 'A project with this information already exists.');
    }
    
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Get deployment status
const getDeploymentStatus = asyncHandler(async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const userId = req.user.id;

    const deployment = await prisma.deployment.findFirst({
    where: {
        id: deploymentId,
        project: { userId }
    },
    include: {
      project: {
          select: {
            name: true,
            subdomain: true,
            framework: true
          }
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 50
        }
      }
  });

    if (!deployment) {
      return ApiError.send(res, 404, 'Deployment not found');
  }

    return res.json(
      ApiResponse.success(
        {
          deployment: {
            id: deployment.id,
            status: deployment.status,
            containerUrl: deployment.containerUrl,
            createdAt: deployment.createdAt,
            updatedAt: deployment.updatedAt
          },
          project: deployment.project,
          logs: deployment.logs
        },
        'Deployment status fetched successfully'
      )
    );

  } catch (error) {
    console.error('Get deployment status error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Get all deployments for a project
const getProjectDeployments = asyncHandler(async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId
      },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          include: {
            logs: {
              orderBy: { createdAt: 'desc' },
              take: 10
            }
          }
        }
      }
  });

    if (!project) {
      return ApiError.send(res, 404, 'Project not found');
    }

    return res.json(
      ApiResponse.success(
        {
          project: {
            id: project.id,
            name: project.name,
            subdomain: project.subdomain,
            framework: project.framework,
            gitUrl: project.gitUrl,
            createdAt: project.createdAt
          },
          deployments: project.deployments
        },
        'Project deployments fetched successfully'
      )
    );

  } catch (error) {
    console.error('Get project deployments error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Redeploy project
const redeployProject = asyncHandler(async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        userId
      }
    });

    if (!project) {
      return ApiError.send(res, 404, 'Project not found');
    }

    // Create new deployment
    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        status: 'QUEUED'
      }
    });

    // Prepare deployment configuration
    const deploymentConfig = {
      name: project.name,
      gitUrl: project.gitUrl,
      envVars: [
        {
          key: 'API_SERVER_URL',
          value: process.env.API_BASE_URL
        },
        {
          key: 'API_KEY',
          value: process.env.BUILDER_API_KEY
        }
      ],
      db: project.db || 'mysql',
      framework: project.framework
    };

    // Trigger AWS builder server
    const triggerResult = await triggerAWSBuilder({
      projectId: project.id,
      deploymentId: deployment.id,
      subdomain: project.subdomain,
      deploymentConfig
    });

    if (!triggerResult.success) {
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { status: 'FAILED' }
      });

      return ApiError.send(res, 500, 'Failed to trigger redeployment');
    }

    return res.json(
      ApiResponse.success(
        {
          deployment: {
            id: deployment.id,
            status: deployment.status,
            createdAt: deployment.createdAt
          }
        },
        'Redeployment started successfully'
      )
    );

  } catch (error) {
    console.error('Redeploy project error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Webhook endpoint for builder server updates
const deploymentWebhook = asyncHandler(async (req, res) => {
  try {
    const { deploymentId, status, url, error, logs } = req.body;

    // Verify webhook signature
    const signature = req.headers['x-webhook-signature'];
    if (!verifyWebhookSignature(req.body, signature)) {
      return ApiError.send(res, 401, 'Invalid webhook signature');
    }

    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      include: { project: { include: { user: true } } }
    });

    if (!deployment) {
      return ApiError.send(res, 404, 'Deployment not found');
    }

    // Update deployment status
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: status.toUpperCase(),
        containerUrl: url,
        updatedAt: new Date()
      }
    });

    // Add logs if provided
    if (logs && Array.isArray(logs)) {
      const logEntries = logs.map(log => ({
        deploymentId,
        projectId: deployment.projectId,
        log: log.message || log
      }));

      await prisma.deploymentLog.createMany({
        data: logEntries
      });
    }

    // Send notifications based on status
    if (status === 'SUCCESS') {
      await notificationService.sendDeploymentSuccess({
        userId: deployment.project.user.id,
        projectName: deployment.project.name,
        url: url
      });
    } else if (status === 'FAILED') {
      await notificationService.sendDeploymentFailed({
        userId: deployment.project.user.id,
        projectName: deployment.project.name,
        error: error
      });
    }

    return res.json(
      ApiResponse.success(null, 'Webhook processed successfully')
    );

  } catch (error) {
    console.error('Deployment webhook error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Health check endpoint
const healthCheck = asyncHandler(async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check AWS connectivity (if configured)
    let awsStatus = 'not-configured';
    if (process.env.AWS_ECS_CLUSTER_ARN) {
      try {
        const AWS = await import('aws-sdk');
        const ecs = new AWS.ECS({
          region: process.env.AWS_REGION,
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        });
        
        await ecs.describeClusters({
          clusters: [process.env.AWS_ECS_CLUSTER_ARN]
        }).promise();
        
        awsStatus = 'connected';
      } catch (error) {
        awsStatus = 'error';
      }
    }

    return res.json(
      ApiResponse.success(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            aws: awsStatus
          }
        },
        'Service health check completed'
      )
    );

  } catch (error) {
    return ApiError.send(res, 503, 'Service unhealthy', error.message);
  }
});

// Project Management Functions (merged from project.controller.js)

// Get all projects for user
const getProjects = asyncHandler(async (req, res) => {
  try {
    const { id } = req.user;

    const projects = await prisma.project.findMany({
      where: { userId: id },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    return res.json(ApiResponse.success(projects, "Projects fetched successfully"));
  } catch (error) {
    console.error('Get projects error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Get project by ID
const getProjectById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
      where: { 
        id,
        userId 
      },
      include: {
        deployments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            containerUrl: true
          }
        },
        customDomains: true
      }
    });

    if (!project) {
      return ApiError.send(res, 404, "Project not found");
  }

    return res.json(ApiResponse.success(project, "Project fetched successfully"));
  } catch (error) {
    console.error('Get project by ID error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Update project
const updateProject = asyncHandler(async (req, res) => {
  try {
  const { id } = req.params;
    const userId = req.user.id;
    const { name, gitUrl, framework } = req.body;

    const project = await prisma.project.findFirst({
      where: { id, userId }
    });

    if (!project) {
      return ApiError.send(res, 404, "Project not found");
    }

    // Check if new Git URL already exists (if changed)
    if (gitUrl && gitUrl !== project.gitUrl) {
      const existingProject = await prisma.project.findUnique({
        where: { gitUrl }
      });

      if (existingProject) {
        return ApiError.send(res, 400, 'A project with this Git URL already exists. Please use a different repository.');
      }
    }

    const updated = await prisma.project.update({
    where: { id },
      data: {
        name,
        gitUrl,
        framework
      },
  });

    return res.json(ApiResponse.success(updated, "Project updated successfully"));
  } catch (error) {
    console.error('Update project error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      if (error.meta?.target?.includes('git_url')) {
        return ApiError.send(res, 400, 'A project with this Git URL already exists. Please use a different repository.');
      }
      return ApiError.send(res, 400, 'A project with this information already exists.');
    }
    
    return ApiError.send(res, 500, 'Internal server error');
  }
});

// Delete project
const deleteProject = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        deployments: {
          include: {
            logs: true,
          },
        },
        customDomains: true,
        domainLogs: true,
      },
    });

    if (!project) {
      return ApiError.send(res, 404, "Project not found");
    }

    // Delete all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete deployment logs
      for (const deployment of project.deployments) {
        await tx.deploymentLog.deleteMany({
          where: { deploymentId: deployment.id },
        });
  }

      // Delete deployments
      await tx.deployment.deleteMany({
        where: { projectId: project.id },
      });

      // Delete domain logs
      await tx.domainLog.deleteMany({
        where: { projectId: project.id },
      });

      // Delete custom domains
      await tx.customDomain.deleteMany({
        where: { projectId: project.id },
      });

      // Delete the project
      await tx.project.delete({
        where: { id: project.id },
      });
    });

    return res.json(ApiResponse.success(null, "Project deleted successfully"));
  } catch (error) {
    console.error('Delete project error:', error);
    return ApiError.send(res, 500, 'Internal server error');
  }
});

export {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  getDeploymentStatus,
  getProjectDeployments,
  redeployProject,
  deploymentWebhook,
  healthCheck
};
