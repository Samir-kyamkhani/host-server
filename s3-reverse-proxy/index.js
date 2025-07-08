// s3-reverse-proxy/index.js
import express from "express";
import httpProxy from "http-proxy";
import url from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PROXY_PORT || 8000;
const BASE_PATH = process.env.S3_BASE_URL;
const API_BASE_URL = process.env.API_BASE_URL;

const proxy = httpProxy.createProxy();

app.use(async (req, res) => {
  try {
    const hostname = req.hostname;

    const response = await fetch(
      `${API_BASE_URL}/api/projects/resolve?domain=${hostname}`
    );
    const result = await response.json();

    if (!result?.data?.subdomain) {
      return res.status(404).send("Project not found");
    }

    const subdomain = result.data.subdomain;

    const parsedUrl = url.parse(req.url);
    let path = parsedUrl.pathname;
    if (path === "/" || path.endsWith("/")) path += "index.html";

    const finalTarget = `${BASE_PATH}/${subdomain}${path}`;

    console.log(`[Proxy] ${hostname} → ${finalTarget}`);

    proxy.web(req, res, {
      target: finalTarget,
      changeOrigin: true,
      ignorePath: true,
      headers: {
        host: new URL(finalTarget).host,
      },
    });
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).send("Internal Reverse Proxy Error");
  }
});

proxy.on("error", (err, req, res) => {
  res.writeHead(502, { "Content-Type": "text/plain" });
  res.end("Bad Gateway");
});

app.listen(PORT, () => {
  console.log(`✅ Reverse Proxy running on http://localhost:${PORT}`);
});
