import Prisma from "../db/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import crypto from "crypto";
import dns from "dns/promises";

export const connectDomain = asyncHandler(async (req, res) => {
  const { domain, projectId } = req.body;
  const userId = req.user.id;

  if (!domain || !projectId) {
    return ApiError.send(res, 400, "Domain and projectId are required");
  }

  // Verify project ownership
  const project = await Prisma.project.findFirst({ 
    where: { 
      id: projectId,
      userId 
    } 
  });
  
  if (!project) {
    return ApiError.send(res, 404, "Project not found");
  }

  // Check if domain is already in use
  const existing = await Prisma.customDomain.findFirst({
    where: { domain },
  });
  
  if (existing) {
    return ApiError.send(res, 409, "Domain already in use");
  }

  const verificationToken = crypto.randomBytes(8).toString("hex");
  
  const customDomain = await Prisma.customDomain.create({
    data: { 
      domain, 
      projectId,
      verificationToken,
      status: "PENDING"
    },
  });

  await Prisma.domainLog.create({
    data: {
      projectId,
      message: `TXT token generated: _hostserver.${domain} → ${verificationToken}`,
    },
  });

  return res.json(
    ApiResponse.success(
      {
        instruction: `Add TXT: _hostserver.${domain} → ${verificationToken}`,
        domain: customDomain
      },
      "Please add TXT DNS record"
    )
  );
});

export const verifyDomain = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const userId = req.user.id;

  if (!projectId) {
    return ApiError.send(res, 400, "ProjectId is required");
  }

  // Verify project ownership
  const project = await Prisma.project.findFirst({ 
    where: { 
      id: projectId,
      userId 
    } 
  });
  
  if (!project) {
    return ApiError.send(res, 404, "Project not found");
  }

  const customDomain = await Prisma.customDomain.findFirst({
    where: { 
      projectId,
      status: "PENDING"
    }
  });

  if (!customDomain || !customDomain.verificationToken) {
    return ApiError.send(res, 404, "No pending domain verification found");
  }

  try {
    const txtDomain = `_hostserver.${customDomain.domain}`;
  const records = (await dns.resolveTxt(txtDomain)).flat().map((r) => r.trim());
    
    if (!records.includes(customDomain.verificationToken)) {
    await Prisma.domainLog.create({
      data: {
        projectId,
        message: `TXT verification failed: ${JSON.stringify(records)}`,
      },
    });
    return ApiError.send(res, 400, "Token not found in TXT record");
  }

    const updatedDomain = await Prisma.customDomain.update({
      data: { 
        status: "VERIFIED",
        verifiedAt: new Date()
      },
      where: { id: customDomain.id },
  });

  await Prisma.domainLog.create({
      data: { projectId, message: `Domain ${customDomain.domain} verified successfully` },
  });

  return res.json(
      ApiResponse.success(updatedDomain, "Domain verified successfully")
  );
  } catch (error) {
    console.error("DNS verification error:", error);
    return ApiError.send(res, 500, "Failed to verify domain");
  }
});

export const removeDomain = asyncHandler(async (req, res) => {
  const { projectId } = req.body;
  const userId = req.user.id;

  if (!projectId) {
    return ApiError.send(res, 400, "ProjectId is required");
  }

  // Verify project ownership
  const project = await Prisma.project.findFirst({ 
    where: { 
      id: projectId,
      userId 
    } 
  });
  
  if (!project) {
    return ApiError.send(res, 404, "Project not found");
  }

  const customDomain = await Prisma.customDomain.findFirst({
    where: { projectId }
  });

  if (!customDomain) {
    return ApiError.send(res, 404, "No custom domain found for this project");
  }

  await Prisma.customDomain.delete({
    where: { id: customDomain.id },
  });

  await Prisma.domainLog.create({
    data: { projectId, message: `Custom domain ${customDomain.domain} removed` },
  });

  return res.json(ApiResponse.success(null, "Domain removed successfully"));
});
