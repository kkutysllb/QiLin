/**
 * hello-tab — QiLin plugin-host self-test plugin (T1 self-contained form).
 *
 * Mirrors the DSH third-party plugin contract (baseline dsh 0.1.2-alpha.2):
 * plain script, registers via window.__ModuleLoader__.load({id, factory}),
 * factory returns the cordis convention object {inject, apply(ctx)}.
 * apply ALWAYS receives the host ctx; services are soft-probed via
 * ctx.get(name) with optional chaining, so a missing service degrades
 * instead of throwing. Here we probe "qiLin.sidebar" to register a
 * sidebar panel — proving the full chain: script injection -> loader ->
 * ctx service probe -> sidebar registry -> rendered tab.
 *
 * The window.__qilinHelloWired guard is the DSH idempotency convention
 * against SPA re-injection double runs.
 */
window.__ModuleLoader__.load({
  id: "qilin/hello-tab",
  factory: function () {
    var exports = {};

    exports.inject = [];

    exports.apply = function apply(ctx) {
      if (window.__qilinHelloWired) return;
      window.__qilinHelloWired = true;

      var sidebar = ctx.get("qiLin.sidebar");
      if (!sidebar || typeof sidebar.registerTab !== "function") {
        console.error("[hello-tab] qiLin.sidebar service unavailable");
        return;
      }

      sidebar.registerTab({
        id: "plugin:hello-tab:main",
        title: "Hello Plugin",
        order: 90,
        mount: function (el) {
          el.textContent = "";
          var card = document.createElement("div");
          card.style.cssText =
            "display:flex;flex-direction:column;gap:8px;padding:12px;font-size:12px;line-height:1.5";
          var title = document.createElement("div");
          title.textContent = "Hello from a DSH-protocol plugin";
          title.style.fontWeight = "600";
          var body = document.createElement("div");
          body.style.color = "var(--muted-foreground, #888)";
          body.textContent =
            "This panel was registered by public/plugins/hello-tab/client.js " +
            "through window.__ModuleLoader__.load + ctx.get('qiLin.sidebar'). " +
            "If you can read this inside the sidebar, the plugin host chain works.";
          var stamp = document.createElement("div");
          stamp.style.fontFamily = "monospace";
          stamp.textContent = "mounted at " + new Date().toISOString();
          card.append(title, body, stamp);
          el.append(card);
        },
        unmount: function (el) {
          el.textContent = "";
        },
      });
    };

    return exports;
  },
});
