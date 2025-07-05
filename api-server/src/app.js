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


import projectRouter from "./routes/projects.routes.js";

// routes declaration
app.use("/api/v1/projects", projectRouter);

export default app;
