import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import crypto from "crypto";
import dns from "dns/promises";

export const connectDomain = asyncHandler(async (req, res) => {
  const { domain, projectId } = req.body;
  const project = await Prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return ApiError.send(res, 404, "Project not found");
  const existing = await Prisma.project.findFirst({
    where: { customDomain: domain },
  });
  if (existing) return ApiError.send(res, 409, "Domain already in use");

  const token = crypto.randomBytes(8).toString("hex");
  const updated = await Prisma.project.update({
    where: { id: projectId },
    data: { customDomain: domain, verificationToken: token, verified: false },
  });

  await Prisma.domainLog.create({
    data: {
      projectId,
      message: `TXT token generated: _hostserver.${domain} → ${token}`,
    },
  });
  return res.json(
    new ApiResponse(200, "Please add TXT DNS record", {
      instruction: `Add TXT: _hostserver.${domain} → ${token}`,
    })
  );
});

export const verifyDomain = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const project = await Prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.customDomain || !project.verificationToken)
    return ApiError.send(res, 404, "Invalid state");

  const txtDomain = `_hostserver.${project.customDomain}`;
  const records = (await dns.resolveTxt(txtDomain)).flat().map((r) => r.trim());
  if (!records.includes(project.verificationToken)) {
    await Prisma.domainLog.create({
      data: {
        projectId,
        message: `TXT verification failed: ${JSON.stringify(records)}`,
      },
    });
    return ApiError.send(res, 400, "Token not found in TXT record");
  }

  const updated = await Prisma.project.update({
    data: { verified: true },
    where: { id: projectId },
  });
  await Prisma.domainLog.create({
    data: { projectId, message: `Domain verified successfully` },
  });
  return res.json(
    new ApiResponse(200, "Domain verified", { project: updated })
  );
});

export const removeDomain = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const project = await Prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return ApiError.send(res, 404, "Project not found");

  await Prisma.project.update({
    where: { id: projectId },
    data: { customDomain: null, verified: false, verificationToken: null },
  });
  await Prisma.domainLog.create({
    data: { projectId, message: "Custom domain removed" },
  });
  return res.json(new ApiResponse(200, "Domain removed"));
});
