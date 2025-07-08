import { Kafka } from "kafkajs";
import { createClient } from "@clickhouse/client";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = createClient({
  host: process.env.CLICKHOUSE_HOST,
  database: "default",
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
});

const kafka = new Kafka({
  clientId: "api-server",
  brokers: [process.env.KAFKA_BROKER],
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname, "../certs/kafka.pem"), "utf-8")],
  },
  sasl: {
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
    mechanism: "plain",
  },
});

const consumer = kafka.consumer({ groupId: "api-server-logs-consumer" });

export async function initKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: ["container-logs"], fromBeginning: true });

  await consumer.run({
    eachBatch: async ({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) => {
      for (const message of batch.messages) {
        if (!message.value) continue;
        const { PROJECT_ID, DEPLOYMENT_ID, log } = JSON.parse(message.value.toString());

        try {
          await client.insert({
            table: "log_events",
            values: [
              { event_id: uuidv4(), deployment_id: DEPLOYMENT_ID, log },
            ],
            format: "JSONEachRow",
          });

          resolveOffset(message.offset);
          await commitOffsetsIfNecessary(message.offset);
          await heartbeat();
        } catch (err) {
          console.error("ClickHouse Insert Error:", err);
        }
      }
    },
  });
}