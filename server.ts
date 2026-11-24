import "dotenv/config";
import express from "express";
import path from "node:path";
import { initializeDatabase } from "./src/server/db.ts";
import { apiRouter } from "./src/server/routes.ts";

const app = express();
const PORT = 3000;

initializeDatabase();

app.use(express.json({ limit: "1mb" }));
app.use("/api", apiRouter);

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SmartCare server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start SmartCare server:", err);
  process.exit(1);
});
