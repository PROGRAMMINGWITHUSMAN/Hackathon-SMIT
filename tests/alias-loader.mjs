// TEST-ONLY module loader: maps the "@/" import alias to src/ so that the
// server modules can be imported directly by Node's test runner.
// This file is never part of the production bundle or the app.
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    let target = specifier.slice(2);
    if (!/\.(js|mjs|cjs)$/.test(target)) {
      target += ".js";
    }
    const url = new URL("../src/" + target, import.meta.url).href;
    return next(url, context);
  }
  return next(specifier, context);
}
