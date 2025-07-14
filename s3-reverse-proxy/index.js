import express from "express";
import httpProxy from "http-proxy";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const app = express();
const PORT = process.env.PROXY_PORT || 8000;
const BASE_PATH = process.env.S3_BASE_URL;
const API_BASE_URL = process.env.API_BASE_URL;

const proxy = httpProxy.createProxy();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.use(
  asyncHandler(async (req, res) => {
    const hostname = req.hostname;
    const subdomain = hostname.split(".")[0];

    let resolvesTo;

    try {
      const { data } = await axios.get(`${API_BASE_URL}/api/projects/resolve`, {
        params: { domain: hostname },
      });

      if (data?.bucketPath) {
        resolvesTo = data.bucketPath;
      } else {
        resolvesTo = `${BASE_PATH}/${subdomain}`;
      }
    } catch (error) {
      console.error("Error resolving domain:", error.message);
      resolvesTo = `${BASE_PATH}/${subdomain}`;
    }

    return proxy.web(req, res, {
      target: resolvesTo,
      changeOrigin: true,
    });
  })
);

// Automatically add index.html for root URL
proxy.on("proxyReq", (proxyReq, req, res) => {
  if (req.url === "/") {
    proxyReq.path += "index.html";
  }
});

app.listen(PORT, () =>
  console.log(`Reverse Proxy running on http://localhost:${PORT}`)
);
