/**
 * A minimal authenticated client for the site's own API, for command-line tools.
 *
 * ## Why a session login and not an API token
 *
 * A token would need a model, a hashing scheme, scopes, a mint-and-revoke screen
 * and a story for what happens when one leaks — a whole feature, to let a script
 * do something an account can already do. Logging in as a real team member
 * instead means the existing permission checks apply unchanged, the audit log
 * records *who* registered the source rather than "a script", and revocation is
 * the thing that already exists: disable the account.
 *
 * The password is never required to be stored. When it is not in the
 * environment, it is prompted for on the terminal with echo off, which is the
 * posture a one-off command should have.
 *
 * ## Why the cookies are handled by hand
 *
 * Node's fetch has no cookie jar. The API needs two: the session, and the CSRF
 * token echoed back in a header. That is four lines here versus a dependency,
 * and the four lines are the ones that document how the site's CSRF scheme
 * works from the outside.
 */

export interface ApiClientOptions {
  baseUrl: string;
  email: string;
  password: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  data?: T;
  error?: { code?: string; message?: string; fields?: Record<string, string[]> };
}

export class ApiClient {
  private cookies = new Map<string, string>();

  private constructor(private readonly baseUrl: string) {}

  static async login(options: ApiClientOptions): Promise<ApiClient> {
    const client = new ApiClient(options.baseUrl.replace(/\/+$/, ''));

    /*
      One GET before the login, exactly as a browser does when it loads the sign-in
      page. Login is a mutation and so requires a CSRF token, and the token is
      minted by the middleware on any ordinary request — so a client that goes
      straight to POST has nothing to send and is refused. This is that page load.
    */
    await client.request('GET', '/belepes');

    await client.request('POST', '/api/v1/auth/login', {
      email: options.email,
      password: options.password,
    });

    return client;
  }

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const query = new URLSearchParams(params).toString();
    return this.request<T>('GET', query ? `${path}?${query}` : path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };

    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    /*
      The API requires the CSRF token in a header *and* in a cookie, and rejects
      the request if they differ. A browser gets the cookie from the login
      response; so do we. No `Origin` header is sent, which the same-origin check
      explicitly allows for non-browser clients.
    */
    const csrf = this.cookies.get('__Host-yonagi_csrf') ?? this.cookies.get('yonagi_csrf');
    if (csrf) headers['x-csrf-token'] = csrf;

    if (body !== undefined) headers['content-type'] = 'application/json';

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });

    this.absorbCookies(response);

    const payload = (await response.json().catch(() => ({}))) as Envelope<T>;

    if (!response.ok) {
      throw new ApiError(
        payload.error?.message ?? `${method} ${path} — HTTP ${response.status}`,
        response.status,
        payload.error?.fields,
      );
    }

    return payload.data as T;
  }

  /**
   * Reads `set-cookie` from a response.
   *
   * Only the name and value are kept: attributes like `Secure` and `SameSite`
   * govern how a *browser* stores a cookie, and a script that tried to honour
   * them would be reimplementing a cookie jar for no gain. Expiry is not
   * tracked either — the process is shorter-lived than any session.
   */
  private absorbCookies(response: Response): void {
    const raw =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') ?? ''].filter(Boolean);

    for (const entry of raw) {
      const [pair] = entry.split(';');
      const index = pair?.indexOf('=') ?? -1;
      if (!pair || index <= 0) continue;

      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();

      // A cleared cookie is a deletion, not a value.
      if (value === '' || value === 'deleted') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

/**
 * Reads a password from the terminal without echoing it.
 *
 * Falls back to a plain read when stdin is not a TTY (a pipe, CI), because
 * refusing there would break the one case where the password legitimately comes
 * from somewhere else.
 */
export async function promptPassword(prompt: string): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').trim();
  }

  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve) => {
    let value = '';

    const onData = (chunk: Buffer) => {
      const text = chunk.toString('utf8');

      for (const char of text) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }

        // Ctrl+C has to keep working: raw mode means the terminal no longer
        // delivers it as a signal.
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }

        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };

    stdin.on('data', onData);
  });
}
