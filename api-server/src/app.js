import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
const data = "10mb";

app.use(
  cors({
    origin: process.env.CLIENT_URI,
    credentials: true,
  })
);

app.use(express.json({ limit: data }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

import projectRoutes from "./routes/projects.routes.js";
import deploymentRoutes from "./routes/deployment.routes.js";
import authRoutes from "./routes/auth.routes.js";
import domainRoutes from "./routes/domain.routes.js";

app.use("/api/v1/projects", projectRoutes);
app.use("/api/v1/deployments", deploymentRoutes);
app.use("/api/v1",authRoutes);
app.use("/api/v1/domain", domainRoutes);

export default app;
