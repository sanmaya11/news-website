const path = require("path");
const express = require("express");

// Never let an unexpected error kill this local single-user server.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api/news", require("./routes/news"));
app.use("/api/article", require("./routes/article"));

// Final safety net: any route error still resolves to JSON, never a stack trace.
app.use((err, req, res, next) => {
  console.error("[express error]", err);
  res.status(200).json({ error: false, note: "Something went wrong loading that. Please try again." });
});

app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;
  console.log(`News website running at ${url}`);
  try {
    const open = (await import("open")).default;
    await open(url);
  } catch {
    console.log("Could not auto-open a browser — open the URL above manually.");
  }
});
