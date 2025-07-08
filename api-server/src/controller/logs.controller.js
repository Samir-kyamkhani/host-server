import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { createClient } from "@clickhouse/client";

const client = createClient({
  host: process.env.CLICKHOUSE_HOST,
  database: "default",
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
});

export const getLogs = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const logs = await client.query({
    query: `SELECT event_id, deployment_id, log, timestamp FROM log_events WHERE deployment_id = {deployment_id:String}`,
    query_params: { deployment_id: id },
    format: "JSONEachRow",
  });

  const rawLogs = await logs.json();
  return res.status(200).json(new ApiResponse(200, "Logs fetched successfully", rawLogs));
});