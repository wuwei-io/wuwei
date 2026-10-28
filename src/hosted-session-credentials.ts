/** Desktop installs one account-scoped resolver. CLI/static credentials retain
 * their original behavior; a media request never adopts another account. */
type Resolver = (originalToken: string, rejectedToken?: string) => Promise<string>;
let resolver: Resolver | undefined;
export class HostedCredentialError extends Error {
  constructor(public readonly code: 'AUTH_REQUIRED' | 'ACCOUNT_CHANGED') { super(code); }
}
export function setHostedCredentialResolver(next: Resolver | undefined) { resolver = next; }
export function hostedCredentialProvider(originalToken: string) {
  return (rejectedToken?: string): string | Promise<string> => resolver
    ? resolver(originalToken, rejectedToken) : originalToken;
}
export function accountScopedCredentialResolver(deps: {
  currentToken: () => string | undefined;
  freshToken: (rejectedToken?: string) => Promise<string | undefined>;
}): Resolver {
  const subject = (token: string) => {try {
    const sub = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch { return null; }};
  const sameAccount = (a: string, b: string) => a === b || !!subject(a) && subject(a) === subject(b);
  return async (original, rejected) => {
    const before = deps.currentToken();
    if (!before) throw new HostedCredentialError('AUTH_REQUIRED');
    if (!sameAccount(original, before)) throw new HostedCredentialError('ACCOUNT_CHANGED');
    const fresh = await deps.freshToken(rejected);
    const current = deps.currentToken();
    if (!fresh || !current) throw new HostedCredentialError('AUTH_REQUIRED');
    if (!sameAccount(original, fresh) || !sameAccount(original, current)) throw new HostedCredentialError('ACCOUNT_CHANGED');
    return fresh;
  };
}
