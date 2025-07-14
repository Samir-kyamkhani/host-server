import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { config, s3Client } from "../services/config.js";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { hashPassword } from "../utils/utils.js";


const createProject = asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(1, "Project name is required"),
    gitUrl: z.string().url("A valid git URL is required"),
    envVars: z
      .array(
        z.object({
          key: z.string().min(1),
          value: z.string().optional(),
        })
      )
      .optional(),
  });

  const safeParseResult = schema.safeParse(req.body);
  if (!safeParseResult.success) {
    return ApiError.send(res, 400, safeParseResult.error.flatten());
  }

  const { name, gitUrl, envVars } = safeParseResult.data;

  const normalizedgitUrl = gitUrl.trim().toLowerCase();

  const existingProject = await Prisma.project.findUnique({
    where: { gitUrl: normalizedgitUrl },
  });

  if (existingProject) {
    return ApiError.send(
      res,
      409,
      "A project with this Git URL already exists."
    );
  }


  const hashedEnvVars = await Promise.all(
    (envVars || []).map(async ({ key, value }) => ({
      key,
      value: await hashPassword(value),
    }))
  );

  const project = await Prisma.project.create({
    data: {
      name,
      gitUrl: normalizedgitUrl,
      subdomain: generateSlug(),
      userId: req.user.id,
      envVars: hashedEnvVars.length
        ? {
          create: hashedEnvVars,
        }
        : undefined,
    },
    include: {
      envVars: true,
    },
  });


  return res
    .status(201)
    .json(new ApiResponse(201, "Project created successfully", project));
});


const getProjects = asyncHandler(async (req, res) => {
  const { id } = req.user;

  const projects = await Prisma.project.findMany({
    where: { userId: id },
  });

  return res.json(new ApiResponse(200, "Projects", projects));
});

const getProjectById = asyncHandler(async (req, res) => {
  const project = await Prisma.project.findUnique({
    where: { id: req.params.id },
  });

  if (!project) return ApiError.send(res, 404, "Project not found");

  return res.json(new ApiResponse(200, "Project", project));
});

const updateProject = asyncHandler(async (req, res) => {
  const { name, gitUrl } = req.body;

  const updated = await Prisma.project.update({
    where: { id: req.params.id },
    data: {
      name,
      gitUrl,
    },
  });

  return res.json(new ApiResponse(200, "Project updated", updated));
});

const deleteProject = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const project = await Prisma.project.findUnique({
    where: { id },
    include: {
      deployments: {
        include: {
          DeploymentLog: true,
        },
      },
      customDomains: true,
      domainLogs: true,
    },
  });

  if (!project) return ApiError.send(res, 404, "Project not found");

  // 1️⃣ Delete deployment logs
  for (const deployment of project.deployments) {
    await Prisma.deploymentLog.deleteMany({
      where: { deploymentId: deployment.id },
    });
  }

  // 2️⃣ Delete deployments
  await Prisma.deployment.deleteMany({
    where: { projectId: id },
  });

  // 3️⃣ Delete custom domains
  await Prisma.customDomain.deleteMany({
    where: { projectId: id },
  });

  // 4️⃣ Delete domain logs
  await Prisma.domainLog.deleteMany({
    where: { projectId: id },
  });

  // 5️⃣ Delete S3 files
  const s3Prefix = `__outputs/${id}/`;

  const listCommand = new ListObjectsV2Command({
    Bucket: config.BUCKET_NAME,
    Prefix: s3Prefix,
  });

  const listResponse = await s3Client.send(listCommand);

  if (listResponse.Contents && listResponse.Contents.length > 0) {
    const deleteCommand = new DeleteObjectsCommand({
      Bucket: config.BUCKET_NAME,
      Delete: {
        Objects: listResponse.Contents.map((item) => ({ Key: item.Key })),
      },
    });

    await s3Client.send(deleteCommand);
  }

  // 6️⃣ Delete project itself
  await Prisma.project.delete({
    where: { id },
  });

  return res.json(
    new ApiResponse(200, "Project and related data deleted from DB & S3")
  );
});

const resolveDomain = asyncHandler(async (req, res) => {
  const { domain } = req.query;
  if (!domain) return ApiError.send(res, 400, "Missing domain");

  const project = await Prisma.project.findFirst({
    where: {
      OR: [{ customDomain: domain }, { subdomain: domain.split(".")[0] }],
    },
  });

  if (!project) return ApiError.send(res, 404, "Project not found");

  return res
    .status(200)
    .json(
      new ApiResponse(200, "Project resolved", { subdomain: project.subdomain })
    );
});

export {
  createProject,
  getProjects,
  resolveDomain,
  updateProject,
  getProjectById,
  deleteProject,
};
