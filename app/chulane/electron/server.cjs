/**
 * Runs the shared Next.js application in an isolated Electron utility process.
 * The HTTP server binds only to loopback on an available port and reports that
 * port to its owning desktop process. Development and production use the same
 * application; production requires the normal Next.js build to exist.
 */
const next = require("next");
const { createServer } = require("node:http");

const development = process.argv[2] === "development";
process.env.CHULANE_DESKTOP_DEV = development ? "1" : "0";
const application = next({
  dev: development,
  dir: process.cwd(),
  hostname: "127.0.0.1",
});
const server = createServer(application.getRequestHandler());

/**
 * Reports readiness only after the application has prepared and bound its port.
 * @returns No value.
 */
function reportReady() {
  process.parentPort.postMessage(server.address().port);
}

/**
 * Prepares Next.js before admitting requests from the desktop window.
 * @returns Resolves after the server starts listening.
 */
async function startServer() {
  await application.prepare();
  server.listen(0, "127.0.0.1", reportReady);
}

/**
 * Surfaces runtime errors to the launcher through a nonzero process exit.
 * @param error - Failure encountered while preparing or serving the application.
 * @returns No value.
 */
function handleFailure(error) {
  console.error("Chulane web runtime failed:", error);
  process.exit(1);
}

server.on("error", handleFailure);
void startServer().catch(handleFailure);
