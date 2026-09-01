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
  // DSH dictionaries are FLAT ("produced.editedOne": "…"); nested
  // {"produced": {"editedOne"}} is accepted as a secondary form.
  const flat = dict[key];
  if (typeof flat === "string") return flat;
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

/** Best-effort UI language: zh locales when the browser says Chinese. */
function defaultLang(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

/** Register one language dictionary under a namespace. */
function registerSingle(ns: string, lang: string, dict: Dict): () => void {
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
}

const localeService = {
  /**
   * DSH dual form: register(NS, "zh", dict) for one language, or
   * register(NS, { zh: dict, en: dict }) with a language pack object
   * (file-review-tab's chat dictionaries use the object form). The
   * object form's disposer removes every registered language.
   */
  register(
    ns: string,
    lang: string | Record<string, Dict>,
    dict?: Dict,
  ): () => void {
    if (dict !== undefined && typeof lang === "string") {
      return registerSingle(ns, lang, dict);
    }
    if (lang && typeof lang === "object") {
      const disposers: (() => void)[] = [];
      for (const [langKey, pack] of Object.entries(lang)) {
        if (pack && typeof pack === "object") {
          disposers.push(registerSingle(ns, langKey, pack));
        }
      }
      return () => {
        for (const off of disposers) off();
      };
    }
    return () => {
      /* nothing registered: malformed register arguments are a no-op */
    };
  },
  /** Bound translator for one namespace (bind(NS) -> t(key, params?)). */
  bind(ns: string, lang = defaultLang()) {
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

/** Translator bound to one contribution namespace — slot hosts pass this
 * as the component's `t` prop when the contribution declares `locale`. */
export function boundTranslator(
  ns: string,
): (key: string, params?: Record<string, unknown>) => string {
  return localeService.bind(ns);
}
