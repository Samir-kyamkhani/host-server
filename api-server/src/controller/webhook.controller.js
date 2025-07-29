import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

export const addDeploymentLog = asyncHandler(async (req, res) => {
  const { deploymentId, projectId, message, timestamp } = req.body;

  if (!deploymentId || !message || typeof message !== "string") {
    return ApiError.send(
      res,
      400,
      "Missing or invalid 'deploymentId' or 'message'"
    );
  }

  if (!projectId) {
    return ApiError.send(
      res,
      400,
      "Missing 'projectId' - required for deployment log creation"
    );
  }

  const deployment = await Prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true }
  });

  if (!deployment) {
    return ApiError.send(res, 404, "Deployment not found");
  }

  // Verify that the provided projectId matches the deployment's project
  if (deployment.projectId !== projectId) {
    return ApiError.send(res, 400, "ProjectId does not match deployment's project");
  }

  const logData = {
    deploymentId,
    projectId,
    log: message,
  };

  // Optionally handle timestamp if it's provided
  if (timestamp) {
    const parsedDate = new Date(timestamp);
    if (!isNaN(parsedDate)) {
      logData["createdAt"] = parsedDate; // Assuming Prisma allows setting createdAt
    }
  }

  const log = await Prisma.deploymentLog.create({
    data: logData,
  });

  return res
    .status(201)
    .json(ApiResponse.success(log, "Log added successfully", 201));
});

export const getLogsByDeployment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return ApiError.send(res, 400, "Missing deploymentId");
  }

  // Verify deployment exists
  const deployment = await Prisma.deployment.findUnique({
    where: { id },
  });

  if (!deployment) {
    return ApiError.send(res, 404, "Deployment not found");
  }

  const logs = await Prisma.deploymentLog.findMany({
    where: { deploymentId: id },
    orderBy: { createdAt: "asc" },
  });

  return res
    .status(200)
    .json(ApiResponse.success(logs, "Logs fetched successfully"));
});
