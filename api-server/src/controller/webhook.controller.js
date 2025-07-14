import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const addDeploymentLog = asyncHandler(async (req, res) => {
  const { deploymentId, message } = req.body;

  if (!deploymentId || !message) {
    return res.status(400).json({ message: "Missing deploymentId or message" });
  }

  await Prisma.deploymentLog.create({
    data: { deploymentId, log: message },
  });

  return res.status(201).json(new ApiResponse(201, "Log saved"));
});

// GET /logs?deploymentId=clx1...
export const getLogsByDeployment = asyncHandler(async (req, res) => {
  const { deploymentId } = req.query;

  if (!deploymentId)
    return res.status(400).json({ message: "Missing deploymentId" });

  const logs = await Prisma.deploymentLog.findMany({
    where: { deploymentId },
    orderBy: { createdAt: "asc" },
  });

  return res.status(200).json(new ApiResponse(200, "Logs fetched", logs));
});
