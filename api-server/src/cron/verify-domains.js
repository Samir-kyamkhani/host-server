import Prisma from "../db/db.js";
import dns from "dns/promises";

async function retryVerification() {
  const pending = await Prisma.project.findMany({ where: { customDomain: { not: null }, verified: false } });
  for (const project of pending) {
    try {
      const txtDomain = `_hostserver.${project.customDomain}`;
      const records = (await dns.resolveTxt(txtDomain)).flat().map(r => r.trim());
      if (records.includes(project.verificationToken)) {
        await Prisma.project.update({ where: { id: project.id }, data: { verified: true } });
        await Prisma.domainLog.create({ data: { projectId: project.id, message: "Auto-verified by cron" } });
      }
    } catch (e) {
      console.error("Cron verification error:", e);
    }
  }
}
retryVerification();
