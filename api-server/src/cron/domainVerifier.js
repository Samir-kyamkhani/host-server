import Prisma from "../db/db.js";
import dns from "dns/promises";

async function retryVerification() {
  const pending = await Prisma.project.findMany({
    where: {
      customDomain: { not: null },
      verified: false,
    },
  });

  if (pending.length === 0) {
    console.log("✅ No domains pending verification.");
    return;
  }

  for (const project of pending) {
    try {
      const txtDomain = `_hostserver.${project.customDomain}`;
      const records = (await dns.resolveTxt(txtDomain)).flat();

      if (records.includes(project.verificationToken)) {
        await Prisma.project.update({
          where: { id: project.id },
          data: { verified: true },
        });

        await Prisma.domainLog.create({
          data: {
            projectId: project.id,
            message: "✅ Auto-verified by cron",
          },
        });

        console.log(`✅ Verified: ${project.customDomain}`);
      } else {
        console.log(`⏳ Not verified yet: ${project.customDomain}`);
      }
    } catch (e) {
      console.error(`❌ Error verifying ${project.customDomain}:`, e.message);
    }
  }
}
retryVerification();
