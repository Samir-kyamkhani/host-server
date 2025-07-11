import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.S3CLIENT_ACCESSKEYID,
    secretAccessKey: process.env.S3CLIENT_SECRETACCESSKEY,
  },
});

const githubWebhook = asyncHandler(async (req, res) => {
  const event = req.headers["x-github-event"];
  if (event !== "push") return res.status(204).send();

  const { repository } = req.body;
  const gitURL = repository.clone_url.toLowerCase();

  const project = await Prisma.project.findUnique({ where: { gitURL } });
  if (!project) return res.status(404).json({ message: "No project matched" });

  const existing = await Prisma.deployment.findFirst({
    where: { projectId: project.id, status: "IN_PROGRESS" },
  });
  if (existing)
    return res.status(409).json({ message: "Deployment already running" });

  const deployment = await Prisma.deployment.create({
    data: { projectId: project.id, status: "QUEUED" },
  });

  const command = new RunTaskCommand({
    cluster: process.env.ECS_CLUSTER,
    taskDefinition: process.env.ECS_TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: process.env.ECS_SUBNETS.split(","),
        securityGroups: process.env.ECS_SECURITY_GROUPS.split(","),
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-image",
          environment: [
            { name: "GIT_REPOSITORY__URL", value: gitURL },
            { name: "PROJECT_ID", value: project.id },
            { name: "DEPLOYMENT_ID", value: deployment.id },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  return res.status(201).json(new ApiResponse(201, "GitHub build triggered"));
});

const fetchGitHubRepos = asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return ApiError.send(res, 401, "Unauthorized");
  }

  const user = await Prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      githubAccessToken: true,
    },
  });

  if (!user || !user.githubAccessToken) {
    return ApiError.send(res, 400, "GitHub access token not found for user");
  }

  const { data: githubRepos } = await axios.get(
    "https://api.github.com/user/repos",
    {
      headers: {
        Authorization: `Bearer ${user.githubAccessToken}`,
      },
      params: {
        per_page: 100,
        sort: "updated",
        direction: "desc",
      },
    }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, "Fetched GitHub repositories", githubRepos));
});

export { githubWebhook, fetchGitHubRepos };
