import { z } from "zod";
import { generateSlug } from "random-word-slugs";
import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const createProject = asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().min(1, "Project name is required"),
    gitURL: z.string().url("A valid git URL is required"),
  });

  const safeParseResult = schema.safeParse(req.body);
  if (!safeParseResult.success) {
    return ApiError.send(res, 400, safeParseResult.error.flatten());
  }

  const { name, gitURL } = safeParseResult.data;

  const normalizedGitURL = gitURL.trim().toLowerCase();

  const existingProject = await Prisma.project.findUnique({
    where: { gitURL: normalizedGitURL },
  });

  if (existingProject) {
    return ApiError.send(
      res,
      409,
      "A project with this Git URL already exists."
    );
  }

  const project = await Prisma.project.create({
    data: {
      name,
      gitURL,
      subdomain: generateSlug(),
      userId: req.user.id,
    },
  });

  return res
    .status(201)
    .json(new ApiResponse(201, "✅ Project created successfully", project));
});

export const resolveDomain = asyncHandler(async (req, res) => {
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

const getProjects = asyncHandler(async (req, res) => {
  const { id } = req.user;

  const projects = await Prisma.project.findMany({
    where: { userId: id },
  });

  return res.json(new ApiResponse(200, "Projects", projects));
});

export { createProject, getProjects };
