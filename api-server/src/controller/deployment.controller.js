import { RunTaskCommand } from "@aws-sdk/client-ecs";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Prisma from "../db/db.js";
import { config, ecsClient, s3Client } from "../services/config.js";

const createDeployment = asyncHandler(async (req, res) => {
  const { projectId } = req.body;

  if (!projectId) return ApiError.send(res, 400, "Missing projectId");

  const project = await Prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return ApiError.send(res, 404, "Project not found");

  const existing = await Prisma.deployment.findFirst({
    where: { projectId, status: "IN_PROGRESS" },
  });

  if (existing) return ApiError.send(res, 409, "Deployment already running");

  const deployment = await Prisma.deployment.create({
    data: {
      projectId,
      status: "QUEUED",
    },
  });

  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: config.SUBNETS,
        securityGroups: config.SECURITY_GROUPS,
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-image",
          environment: [
            { name: "GIT_REPOSITORY__URL", value: project.gitUrl },
            { name: "PROJECT_ID", value: projectId },
            { name: "DEPLOYMENT_ID", value: deployment.id },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  return res
    .status(201)
    .json(new ApiResponse(201, "Deployment started", deployment));
});

const getAllDeployments = asyncHandler(async (req, res) => {
  const deployments = await Prisma.deployment.findMany({
    orderBy: { createdAt: "desc" },
    include: { project: true },
  });

  return res.json(new ApiResponse(200, "All deployments", deployments));
});

const getDeploymentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deployment = await Prisma.deployment.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!deployment) return ApiError.send(res, 404, "Deployment not found");

  return res.json(new ApiResponse(200, "Deployment found", deployment));
});

const updateDeployment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const deployment = await Prisma.deployment.update({
    where: { id },
    data: { status },
    include: { project: true },
  });

  if (status === "DELETED") {
    const projectId = deployment.projectId;
    const deploymentId = deployment.id;

    const prefix = `__outputs/${projectId}/${deploymentId}/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: prefix,
    });

    const listedObjects = await s3Client.send(listCommand);

    if (listedObjects.Contents && listedObjects.Contents.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Delete: {
          Objects: listedObjects.Contents.map((item) => ({
            Key: item.Key,
          })),
        },
      });

      await s3Client.send(deleteCommand);
    }
  }

  return res.json(new ApiResponse(200, "Deployment updated", deployment));
});

const deleteDeployment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const deployment = await Prisma.deployment.findUnique({
    where: { id },
    include: { project: true },
  });

  if (!deployment) return ApiError.send(res, 404, "Deployment not found");

  const projectId = deployment.projectId;
  const deploymentId = deployment.id;

  const prefix = `__outputs/${projectId}/${deploymentId}/`;

  const listCommand = new ListObjectsV2Command({
    Bucket: config.BUCKET_NAME,
    Prefix: prefix,
  });

  const listedObjects = await s3Client.send(listCommand);

  if (listedObjects.Contents && listedObjects.Contents.length > 0) {
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: listedObjects.Contents.map((item) => ({
          Key: item.Key,
        })),
      },
    });

    await s3Client.send(deleteCommand);
  }

  await Prisma.deployment.delete({ where: { id } });

  return res.json(new ApiResponse(200, "Deployment and S3 files deleted"));
});

export {
  createDeployment,
  getAllDeployments,
  getDeploymentById,
  updateDeployment,
  deleteDeployment,
};
