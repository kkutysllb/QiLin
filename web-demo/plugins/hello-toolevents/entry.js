/**
 * hello-toolevents — H5-b canary (server half). Subscribes to the
 * tools/post-execute face and logs each file mutation event, verifiable
 * in the web-demo dev server log.
 */
export const inject = [];

export function apply(ctx) {
  if (typeof ctx.on !== "function") return;
  ctx.on("tools/post-execute", async (exec, result, next) => {
    const decision = await next();
    console.log(
      "[hello-toolevents] tool:",
      exec.name,
      "path:",
      exec.path ?? "(none)",
      "thread:",
      exec.threadId,
      "decision:",
      decision.kind,
    );
    return decision;
  });
}
