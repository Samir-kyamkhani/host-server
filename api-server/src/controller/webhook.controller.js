import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

export const deploymentWebhook = asyncHandler(async (req, res) => {
  const { deploymentId, status, logs = [] } = req.body;

  if (!deploymentId || !status) {
    return res.status(400).json({ message: "Missing parameters" });
  }

  await Prisma.deployment.update({
    where: { id: deploymentId },
    data: { status },
  });

  if (logs.length) {
    await Prisma.deploymentLog.createMany({
      data: logs.map((log) => ({ deploymentId, log })),
    });
  }

  return res.status(200).json(new ApiResponse(200, "Webhook received"));
});