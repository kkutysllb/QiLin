/**
 * DSH `locale` service parity (H4-d slice 1) — namespace-registered
 * dictionaries with dotted-key lookup (file-review-tab registers
 * ctx.locale.register(NS, "zh"|"en", dict) and renders via t()).
 * Missing keys degrade to the key itself; params interpolate {name}.
 */
import { registerPluginService } from "./services";

type Dict = Record<string, unknown>;

const dicts = new Map<string, Map<string, Dict>>();

function lookupDict(ns: string, lang: string): Dict | undefined {
  return dicts.get(ns)?.get(lang);
}

function lookupKey(dict: Dict | undefined, key: string): string | undefined {
  if (dict === undefined) return undefined;
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Dict)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(
  template: string,
  params?: Record<string, unknown>,
): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

const localeService = {
  register(ns: string, lang: string, dict: Dict): () => void {
    let langs = dicts.get(ns);
    if (langs === undefined) {
      langs = new Map();
      dicts.set(ns, langs);
    }
    langs.set(lang, dict);
    return () => {
      if (langs?.get(lang) === dict) {
        langs.delete(lang);
        if (langs.size === 0) dicts.delete(ns);
      }
    };
  },
  /** Bound translator for one namespace (bind(NS) -> t(key, params?)). */
  bind(ns: string, lang = "en") {
    return (key: string, params?: Record<string, unknown>): string => {
      const hit =
        lookupKey(lookupDict(ns, lang), key) ??
        lookupKey(lookupDict(ns, "en"), key);
      return interpolate(hit ?? key, params);
    };
  },
  t(ns: string, key: string, params?: Record<string, unknown>): string {
    return this.bind(ns)(key, params);
  },
};

registerPluginService("locale", localeService);
