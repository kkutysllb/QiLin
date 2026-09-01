/**
 * hello-turntail — H4-d slice-1 canary. Contributes a DOM-mount row to the
 * "conversation.chat.turnTail" slot so the chat UI + slots service chain is
 * verifiable without a React-bundled plugin. Exercises the cordis ctx
 * property-access form (ctx.slots — H4-d Proxy shim).
 */
(function () {
  "use strict";
  if (window.__helloTurntailWired === true) return; // idempotent (DSH convention)
  window.__helloTurntailWired = true;
  window.__ModuleLoader__.load({
    id: "hello-turntail",
    factory: function () {
      return {
        inject: [],
        apply: function (ctx) {
          var slots = ctx.slots;
          if (!slots || typeof slots.inject !== "function") return;
          return slots.inject(
            "conversation.chat.turnTail",
            function () {
              return slots.register({
                name: "conversation.chat.turnTail",
                priority: 0,
                registrant: "hello-turntail",
                inject: function (sessionId) {
                  return {
                    note:
                      "hello from hello-turntail (session " +
                      String(sessionId).slice(0, 8) +
                      ")",
                  };
                },
                mount: function (el, props) {
                  el.innerHTML = "";
                  var row = document.createElement("div");
                  row.setAttribute("data-testid", "turntail-canary");
                  row.style.cssText =
                    "margin:4px 0;padding:4px 8px;font-size:11px;" +
                    "color:#71717a;border:1px dashed #d4d4d8;border-radius:6px";
                  row.textContent =
                    "🧩 turnTail[" +
                    (props.turn && typeof props.turn === "object"
                      ? String(props.turn.turn ?? "")
                      : String(props.turn ?? "")) +
                    "] " +
                    String(props.bag.note ?? "");
                  el.appendChild(row);
                },
              });
            },
            "hello-turntail: turn tail row",
          );
        },
      };
    },
  });
})();
