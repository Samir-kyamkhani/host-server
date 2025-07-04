import express from "express";

const PORT = 9000;
const app = express();

app.use(express.json());

import projectRouter from "./routes/projects.routes.js";
app.use("/api/v1/projects", projectRouter);

app.listen(PORT, () => {
  console.log(`API Server Running...${PORT}`);
});
