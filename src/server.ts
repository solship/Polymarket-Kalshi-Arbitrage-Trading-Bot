import express from "express";
import path from "path";

const root = path.join(__dirname, "..", "public");
const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(express.static(root));

app.get("/", (_req, res) => {
  res.sendFile(path.join(root, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "kalshi-kickoff" });
});

app.listen(PORT, () => {
  console.log(`Kalshi server: http://localhost:${PORT}`);
});
