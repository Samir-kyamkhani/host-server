import fs from "fs/promises";
import { runCommand } from "../index.js";

export class RepositoryManager {
  constructor(logger, OUTPUT_DIR) {
    this.logger = logger;
    this.OUTPUT_DIR = OUTPUT_DIR;
  }

  async prepareOutputDirectory() {
    try {
      await this.logger.log("🧹 Cleaning existing output directory...");
      await fs.rm(this.OUTPUT_DIR, { recursive: true, force: true });
      await fs.mkdir(this.OUTPUT_DIR, { recursive: true });
    } catch (error) {
      await this.logger.log(
        `❌ Failed to prepare output directory: ${error.message}`,
        "error"
      );
      throw error;
    }
  }

  async cloneRepository(gitUrl, gitBranch) {
    try {
      await this.logger.log(`📥 Cloning repository from: ${gitUrl}`);
      await this.logger.log(`📁 Cloning to directory: ${this.OUTPUT_DIR}`);

      await this.prepareOutputDirectory();

      const cloneCmd = `git clone "${gitUrl}" .`;
      await runCommand({
        command: cloneCmd,
        cwd: this.OUTPUT_DIR,
        publishLog: this.logger.log.bind(this.logger),
      });

      if (gitBranch && gitBranch !== "main") {
        await this.logger.log(`🔄 Checking out branch: ${gitBranch}`);
        await runCommand({
          command: `git checkout ${gitBranch}`,
          cwd: this.OUTPUT_DIR,
          publishLog: this.logger.log.bind(this.logger),
        });
      }

      await this.logger.log("✅ Repository cloned successfully");
    } catch (error) {
      await this.logger.log(
        `❌ Repository cloning failed: ${error.message}`,
        "error"
      );
      throw error;
    }
  }
}
