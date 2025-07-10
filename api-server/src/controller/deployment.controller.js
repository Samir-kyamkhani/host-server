import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Prisma from "../db/db.js";

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3CLIENT_ACCESSKEYID,
    secretAccessKey: process.env.S3CLIENT_SECRETACCESSKEY,
  },
});

const config = {
  CLUSTER: process.env.ECS_CLUSTER,
  TASK: process.env.ECS_TASK,
  SUBNETS: process.env.ECS_SUBNETS?.split(",") || [],
  SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS?.split(",") || [],
};

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

export { createDeployment };
