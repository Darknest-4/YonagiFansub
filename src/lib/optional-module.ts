import 'server-only';

/**
 * Loads an optional peer dependency at runtime.
 *
 * `redis` (only needed with `RATE_LIMIT_DRIVER=redis`) and `nodemailer` (only
 * needed with `MAIL_DRIVER=smtp`) are deliberately *not* in `package.json`: a
 * deployment that uses neither should not carry, audit or patch them.
 *
 * The specifier is passed through a variable so that neither TypeScript nor the
 * bundler tries to resolve it at build time — a literal `import('redis')` would
 * fail the type-check on an installation that does not have it. `webpackIgnore`
 * keeps the call as a real runtime import in the server bundle.
 */
export async function optionalImport<T = unknown>(specifier: string): Promise<T | null> {
  try {
    const moduleSpecifier = specifier;
    return (await import(/* webpackIgnore: true */ moduleSpecifier)) as T;
  } catch {
    return null;
  }
}
