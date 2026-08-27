import type { D1Database } from '@cloudflare/workers-types';
import { betterAuth } from 'better-auth';

export interface AuthEnvironment {
  DB?: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OWNER_IDENTITIES?: string;
  ENVIRONMENT?: string;
}

export type ConfiguredAuthEnvironment = AuthEnvironment & Required<Pick<AuthEnvironment,
  'DB' |
  'BETTER_AUTH_SECRET' |
  'BETTER_AUTH_URL' |
  'GITHUB_CLIENT_ID' |
  'GITHUB_CLIENT_SECRET' |
  'GOOGLE_CLIENT_ID' |
  'GOOGLE_CLIENT_SECRET' |
  'OWNER_IDENTITIES'
>>;

export function isAuthConfigured(environment: AuthEnvironment): environment is ConfiguredAuthEnvironment {
  return Boolean(
    environment.DB &&
    environment.BETTER_AUTH_SECRET &&
    environment.BETTER_AUTH_URL &&
    environment.GITHUB_CLIENT_ID &&
    environment.GITHUB_CLIENT_SECRET &&
    environment.GOOGLE_CLIENT_ID &&
    environment.GOOGLE_CLIENT_SECRET &&
    environment.OWNER_IDENTITIES,
  );
}

function providerIdentity(providerId: string, profile: Record<string, unknown> | undefined) {
  const stableId = profile?.id ?? profile?.sub;
  return stableId === undefined ? null : `${providerId}:${String(stableId)}`;
}

export function createAuth(environment: ConfiguredAuthEnvironment) {
  const allowed = new Set(
    environment.OWNER_IDENTITIES.split(',').map((value) => value.trim()).filter(Boolean),
  );

  return betterAuth({
    appName: 'DevOps by hmrdkn-labs',
    database: environment.DB,
    baseURL: environment.BETTER_AUTH_URL,
    secret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: [environment.BETTER_AUTH_URL],
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: environment.ENVIRONMENT === 'production',
    },
    user: {
      validateUserInfo: async ({ source }) => {
        if (!source.oauth) {
          return {
            error: 'oauth_required',
            errorDescription: 'This owner beta accepts approved OAuth identities only.',
          };
        }
        const identity = providerIdentity(source.oauth.providerId, source.oauth.profile);
        if (!identity || !allowed.has(identity)) {
          return {
            error: 'identity_not_allowed',
            errorDescription: 'This identity is not approved for the owner beta.',
          };
        }
        if (source.action === 'create-user') {
          const existing = await environment.DB
            .prepare('SELECT id FROM user LIMIT 1')
            .first<{ id: string }>();
          if (existing) {
            return {
              error: 'owner_already_claimed',
              errorDescription: 'Link this provider from the existing owner session.',
            };
          }
        }
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        trustedProviders: ['github', 'google'],
        allowDifferentEmails: true,
        allowUnlinkingAll: false,
      },
    },
    socialProviders: {
      github: {
        clientId: environment.GITHUB_CLIENT_ID,
        clientSecret: environment.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: environment.GOOGLE_CLIENT_ID,
        clientSecret: environment.GOOGLE_CLIENT_SECRET,
        requireEmailVerification: true,
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
