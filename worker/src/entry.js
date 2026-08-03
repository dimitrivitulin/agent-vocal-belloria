import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

import { oauthApiHandler, oauthDefaultHandler } from "./index.js";

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: oauthApiHandler,
  defaultHandler: oauthDefaultHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["belloria:mcp"],
  allowPlainPKCE: false,
  accessTokenTTL: 3600,
  refreshTokenTTL: 2592000,
  resourceMetadata: {
    resource: "https://belloria-assistant.belloria-dvitulin.workers.dev/mcp",
    scopes_supported: ["belloria:mcp"],
    bearer_methods_supported: ["header"],
    resource_name: "Belloria"
  }
});
