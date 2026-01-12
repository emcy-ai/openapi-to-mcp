/**
 * Code Generator - Generates MCP server code from tool definitions
 */

import type {
  McpToolDefinition,
  GeneratorOptions,
  GeneratedFiles,
  SecurityScheme,
} from "./types.js";

/**
 * Generate a complete MCP server from tool definitions
 */
export function generateMcpServer(
  tools: McpToolDefinition[],
  options: GeneratorOptions,
  securitySchemes: Record<string, SecurityScheme> = {}
): GeneratedFiles {
  const files: GeneratedFiles = {};

  files["package.json"] = generatePackageJson(options);
  files["tsconfig.json"] = generateTsConfig();
  files["src/index.ts"] = generateServerEntry(tools, options, securitySchemes);
  files["src/transport.ts"] = generateTransport(options);
  files[".env.example"] = generateEnvExample(tools, securitySchemes, options);
  files["README.md"] = generateReadme(options);

  return files;
}

function generatePackageJson(options: GeneratorOptions): string {
  const pkg = {
    name: options.name,
    version: options.version || "1.0.0",
    description: `MCP Server generated from OpenAPI spec`,
    type: "module",
    main: "build/index.js",
    scripts: {
      build: "tsc",
      start: "node build/index.js",
      "start:http": "node build/index.js --transport=streamable-http",
      dev: "tsc --watch",
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.10.0",
      axios: "^1.9.0",
      dotenv: "^16.4.5",
      hono: "^4.7.7",
      "@hono/node-server": "^1.14.1",
      ...(options.emcyEnabled
        ? {
            "@emcy/sdk": options.localSdkPath
              ? `file:${options.localSdkPath}`
              : "^0.1.0",
          }
        : {}),
    },
    devDependencies: {
      "@types/node": "^22.15.2",
      typescript: "^5.8.3",
    },
    engines: {
      node: ">=20.0.0",
    },
  };

  return JSON.stringify(pkg, null, 2);
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022"],
      outDir: "./build",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      sourceMap: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "build"],
  };

  return JSON.stringify(config, null, 2);
}

function generateServerEntry(
  tools: McpToolDefinition[],
  options: GeneratorOptions,
  securitySchemes: Record<string, SecurityScheme>
): string {
  const toolDefinitions = tools
    .map((tool) => {
      return `  ["${tool.name}", {
    name: "${tool.name}",
    description: ${JSON.stringify(tool.description)},
    inputSchema: ${JSON.stringify(tool.inputSchema)},
    method: "${tool.httpMethod}",
    pathTemplate: "${tool.pathTemplate}",
    parameters: ${JSON.stringify(tool.parameters)},
    requestBodyContentType: ${
      tool.requestBodyContentType
        ? `"${tool.requestBodyContentType}"`
        : "undefined"
    },
    securitySchemes: ${JSON.stringify(tool.securitySchemes)},
  }]`;
    })
    .join(",\n");

  const emcyImport = options.emcyEnabled
    ? `import { EmcyTelemetry } from '@emcy/sdk';\n`
    : "";

  const emcyInit = options.emcyEnabled
    ? `
// Initialize Emcy telemetry if API key is provided
const emcy = process.env.EMCY_API_KEY
  ? new EmcyTelemetry({
      apiKey: process.env.EMCY_API_KEY,
      endpoint: process.env.EMCY_TELEMETRY_URL,
      mcpServerId: process.env.EMCY_MCP_SERVER_ID,
      debug: process.env.EMCY_DEBUG === 'true',
    })
  : null;

// Set server info for telemetry metadata
if (emcy) {
  emcy.setServerInfo(SERVER_NAME, SERVER_VERSION);
}
`
    : "";

  const emcyTrace = options.emcyEnabled
    ? `
    // Wrap with Emcy telemetry if enabled
    if (emcy) {
      return emcy.trace(toolName, async () => executeRequest(toolDefinition, toolArgs ?? {}));
    }
`
    : "";

  // MCP OAuth configuration - whether this server requires OAuth authentication from clients
  const hasMcpOAuth = options.oauth2Config?.authorizationServerUrl;
  const mcpOAuthConfig = hasMcpOAuth
    ? `
// MCP OAuth 2.0 Configuration (RFC 9728 Protected Resource Metadata)
// This MCP server acts as an OAuth Resource Server - clients must authenticate via the Authorization Server
const MCP_OAUTH_CONFIG = {
  // The Authorization Server URL that issues tokens for this MCP server
  authorizationServerUrl: process.env.OAUTH_AUTHORIZATION_SERVER || ${JSON.stringify(options.oauth2Config?.authorizationServerUrl || "")},
  // The canonical resource identifier for this MCP server
  resourceUrl: process.env.MCP_RESOURCE_URL || \`http://localhost:\${process.env.PORT || 3000}\`,
  // Scopes this MCP server supports
  scopesSupported: ${JSON.stringify(options.oauth2Config?.scopes || [])},
  // Whether to require OAuth authentication (can be disabled for development)
  requireAuth: process.env.MCP_REQUIRE_AUTH !== 'false',
};
`
    : "";

  return `#!/usr/bin/env node
/**
 * MCP Server: ${options.name}
 * Generated by Emcy OpenAPI-to-MCP Generator
 */

import dotenv from 'dotenv';
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
  type CallToolRequest
} from "@modelcontextprotocol/sdk/types.js";
import axios, { type AxiosRequestConfig, type AxiosError } from 'axios';
import { setupStreamableHttpServer } from "./transport.js";
${emcyImport}
// Configuration
export const SERVER_NAME = "${options.name}";
export const SERVER_VERSION = "${options.version || "1.0.0"}";
export const API_BASE_URL = process.env.API_BASE_URL || "${options.baseUrl}";

// Tool definition interface
interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  method: string;
  pathTemplate: string;
  parameters: { name: string; in: string; required: boolean }[];
  requestBodyContentType?: string;
  securitySchemes: string[];
}

// Security schemes
const securitySchemes: Record<string, unknown> = ${JSON.stringify(
    securitySchemes,
    null,
    2
  )};
${mcpOAuthConfig}${emcyInit}
// Tool definitions
const toolDefinitionMap: Map<string, McpToolDefinition> = new Map([
${toolDefinitions}
]);

// Create MCP server
const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolsForClient: Tool[] = Array.from(toolDefinitionMap.values()).map(def => ({
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema as Tool['inputSchema'],
  }));
  return { tools: toolsForClient };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest): Promise<CallToolResult> => {
  const { name: toolName, arguments: toolArgs } = request.params;
  const toolDefinition = toolDefinitionMap.get(toolName);
  
  if (!toolDefinition) {
    return { content: [{ type: "text", text: \`Error: Unknown tool: \${toolName}\` }] };
  }
  
  try {
${emcyTrace}
    return await executeRequest(toolDefinition, toolArgs ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: \`Error: \${message}\` }] };
  }
});

// Execute API request
async function executeRequest(
  def: McpToolDefinition,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  let url = def.pathTemplate;
  const queryParams: Record<string, unknown> = {};
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  
  // Apply path and query parameters
  for (const param of def.parameters) {
    const value = args[param.name];
    if (value !== undefined && value !== null) {
      if (param.in === 'path') {
        url = url.replace(\`{\${param.name}}\`, encodeURIComponent(String(value)));
      } else if (param.in === 'query') {
        queryParams[param.name] = value;
      } else if (param.in === 'header') {
        headers[param.name.toLowerCase()] = String(value);
      }
    }
  }
  
  // Apply security headers for upstream API calls (API key, Bearer token, etc.)
  applySecurityHeaders(headers, def.securitySchemes);
  
  // Build request config
  const config: AxiosRequestConfig = {
    method: def.method,
    url: \`\${API_BASE_URL}\${url}\`,
    params: queryParams,
    headers,
  };
  
  // Add request body if present
  if (def.requestBodyContentType && args.requestBody !== undefined) {
    config.data = args.requestBody;
    headers['content-type'] = def.requestBodyContentType;
  }
  
  console.error(\`Executing: \${def.method.toUpperCase()} \${config.url}\`);
  
  const response = await axios(config);
  
  let responseText: string;
  if (typeof response.data === 'object') {
    responseText = JSON.stringify(response.data, null, 2);
  } else {
    responseText = String(response.data ?? '');
  }
  
  return {
    content: [{ type: "text", text: \`Status: \${response.status}\\n\\n\${responseText}\` }]
  };
}

// Apply security headers for upstream API authentication
// Note: This is for authenticating to the UPSTREAM API, not for MCP client auth
function applySecurityHeaders(headers: Record<string, string>, schemeNames: string[]) {
  for (const schemeName of schemeNames) {
    const scheme = securitySchemes[schemeName] as Record<string, unknown> | undefined;
    if (!scheme) continue;

    const envKey = schemeName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

    if (scheme.type === 'apiKey') {
      const apiKey = process.env[\`API_KEY_\${envKey}\`];
      if (apiKey && scheme.in === 'header' && typeof scheme.name === 'string') {
        headers[scheme.name.toLowerCase()] = apiKey;
      }
    } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      const token = process.env[\`BEARER_TOKEN_\${envKey}\`];
      if (token) {
        headers['authorization'] = \`Bearer \${token}\`;
      }
    } else if (scheme.type === 'oauth2') {
      // For upstream OAuth APIs, use a pre-configured access token from environment
      // The MCP server doesn't manage OAuth flows for upstream APIs - it uses static tokens
      const token = process.env[\`OAUTH_ACCESS_TOKEN_\${envKey}\`] || process.env.UPSTREAM_ACCESS_TOKEN;
      if (token) {
        headers['authorization'] = \`Bearer \${token}\`;
      }
    }
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const useHttp = args.includes('--transport=streamable-http');
  
  if (useHttp) {
    const port = parseInt(process.env.PORT || '3000', 10);
    await setupStreamableHttpServer(server, port);
  } else {
    // Stdio transport for Claude Desktop, etc.
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(\`\${SERVER_NAME} running on stdio\`);
  }
}

main().catch(console.error);
`;
}

function generateTransport(options: GeneratorOptions): string {
  const hasOAuth = options.oauth2Config?.authorizationServerUrl;

  // OAuth-specific code blocks
  const oauthImports = hasOAuth ? `
// OAuth configuration from MCP_OAUTH_CONFIG in index.ts
declare const MCP_OAUTH_CONFIG: {
  authorizationServerUrl: string;
  resourceUrl: string;
  scopesSupported: string[];
  requireAuth: boolean;
};
` : "";

  const protectedResourceMetadataEndpoint = hasOAuth ? `
  // OAuth 2.0 Protected Resource Metadata (RFC 9728)
  // This endpoint tells MCP clients where to get tokens
  app.get('/.well-known/oauth-protected-resource', (c) => {
    const resourceUrl = MCP_OAUTH_CONFIG.resourceUrl || \`\${c.req.header('x-forwarded-proto') || 'http'}://\${c.req.header('host')}\`;

    return c.json({
      resource: resourceUrl,
      authorization_servers: [
        { issuer: MCP_OAUTH_CONFIG.authorizationServerUrl }
      ],
      scopes_supported: MCP_OAUTH_CONFIG.scopesSupported,
      bearer_methods_supported: ['header'],
      resource_documentation: \`\${resourceUrl}/health\`,
    });
  });
` : "";

  const oauthMiddleware = hasOAuth ? `
  // OAuth token validation middleware for /mcp endpoint
  const validateToken = async (c: any, next: any) => {
    // Skip auth if disabled (for development)
    if (!MCP_OAUTH_CONFIG.requireAuth) {
      return next();
    }

    const authHeader = c.req.header('authorization');
    const resourceMetadataUrl = \`\${c.req.header('x-forwarded-proto') || 'http'}://\${c.req.header('host')}/.well-known/oauth-protected-resource\`;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Return 401 with WWW-Authenticate header per MCP OAuth spec
      return c.json(
        {
          error: 'unauthorized',
          error_description: 'Bearer token required'
        },
        401,
        {
          'WWW-Authenticate': \`Bearer resource_metadata="\${resourceMetadataUrl}"\`
        }
      );
    }

    const token = authHeader.substring(7);

    // Basic token validation - in production, verify JWT signature and claims
    // For now, just check token exists and is not empty
    if (!token || token.length < 10) {
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'The access token is invalid or expired'
        },
        401,
        {
          'WWW-Authenticate': \`Bearer resource_metadata="\${resourceMetadataUrl}", error="invalid_token"\`
        }
      );
    }

    // Token appears valid - proceed
    // Note: Production implementations should verify:
    // - JWT signature against Authorization Server's JWKS
    // - Token expiration (exp claim)
    // - Audience claim matches this MCP server (aud claim)
    // - Issuer matches configured Authorization Server (iss claim)
    console.error(\`Request authenticated with token: \${token.substring(0, 20)}...\`);
    return next();
  };
` : "";

  const mcpEndpointWithAuth = hasOAuth ? `
  // Streamable HTTP Transport (MCP spec 2025-03-26) with OAuth protection
  app.all("/mcp", validateToken, async (c) => {` : `
  // Streamable HTTP Transport (MCP spec 2025-03-26)
  app.all("/mcp", async (c) => {`;

  const oauthStartupMessage = hasOAuth ? `
    console.error(\`║  OAuth:  Protected Resource Metadata available               ║\`);
    console.error(\`║          \${('http://localhost:' + info.port + '/.well-known/oauth-protected-resource').padEnd(52)} ║\`);` : "";

  return `/**
 * HTTP Transport for MCP
 * Uses Streamable HTTP transport (MCP specification 2025-03-26)
 * ${hasOAuth ? 'With OAuth 2.0 authentication (RFC 9728)' : 'No authentication configured'}
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SERVER_NAME, SERVER_VERSION } from './index.js';
${oauthImports}
const { WebStandardStreamableHTTPServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
);

const transports: Map<string, InstanceType<typeof WebStandardStreamableHTTPServerTransport>> = new Map();

export async function setupStreamableHttpServer(mcpServer: Server, port = 3000) {
  const app = new Hono();

  // CORS configuration for browser/client access
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Accept', 'Authorization', 'mcp-session-id', 'Last-Event-ID'],
    exposeHeaders: ['mcp-session-id', 'WWW-Authenticate'],
  }));
${protectedResourceMetadataEndpoint}${oauthMiddleware}
  // Health check endpoint
  app.get('/health', (c) => {
    return c.json({
      status: 'OK',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      mcp: {
        transport: 'streamable-http',
        endpoints: {
          mcp: '/mcp',
          health: '/health'${hasOAuth ? `,
          'protected-resource-metadata': '/.well-known/oauth-protected-resource'` : ''}
        }${hasOAuth ? `,
        oauth: {
          required: typeof MCP_OAUTH_CONFIG !== 'undefined' && MCP_OAUTH_CONFIG.requireAuth,
          authorization_server: typeof MCP_OAUTH_CONFIG !== 'undefined' ? MCP_OAUTH_CONFIG.authorizationServerUrl : null
        }` : ''}
      }
    });
  });
${mcpEndpointWithAuth}
    const sessionId = c.req.header('mcp-session-id');

    // Existing session
    if (sessionId && transports.has(sessionId)) {
      return transports.get(sessionId)!.handleRequest(c.req.raw);
    }

    // New session - create transport
    if (!sessionId) {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          transports.set(newSessionId, transport);
          console.error(\`New MCP session: \${newSessionId}\`);
        }
      });

      transport.onerror = (err: Error) => console.error('Transport error:', err);
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          transports.delete(sid);
          console.error(\`Session closed: \${sid}\`);
        }
      };

      await mcpServer.connect(transport);
      return transport.handleRequest(c.req.raw);
    }

    // Session not found
    return c.json({
      error: 'Session not found',
      message: 'The specified session ID does not exist. Start a new session by omitting the mcp-session-id header.'
    }, 404);
  });

  // Legacy /sse endpoint - redirect to /mcp with guidance
  app.get("/sse", (c) => {
    return c.json({
      error: 'SSE transport deprecated',
      message: 'The SSE transport was deprecated in MCP specification 2025-03-26. Please use the Streamable HTTP transport at /mcp instead.',
      redirect: '/mcp'
    }, 410);
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.error('');
    console.error(\`╔═══════════════════════════════════════════════════════════════╗\`);
    console.error(\`║  MCP Server: \${SERVER_NAME.padEnd(46)} ║\`);
    console.error(\`╠═══════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  Status: Running                                              ║\`);
    console.error(\`║  Port:   \${String(info.port).padEnd(53)} ║\`);
    console.error(\`╠═══════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  Endpoints:                                                   ║\`);
    console.error(\`║    MCP:    http://localhost:\${info.port}/mcp\`.padEnd(64) + \`║\`);
    console.error(\`║    Health: http://localhost:\${info.port}/health\`.padEnd(64) + \`║\`);${oauthStartupMessage}
    console.error(\`╠═══════════════════════════════════════════════════════════════╣\`);
    console.error(\`║  For AI Clients:                                              ║\`);
    console.error(\`║    ChatGPT/Cursor URL: http://localhost:\${info.port}/mcp\`.padEnd(64) + \`║\`);
    console.error(\`║    Claude Desktop: Use stdio transport (npm start)            ║\`);
    console.error(\`╚═══════════════════════════════════════════════════════════════╝\`);
    console.error('');
  });

  return app;
}
`;
}

function generateEnvExample(
  tools: McpToolDefinition[],
  securitySchemes: Record<string, SecurityScheme>,
  options: GeneratorOptions
): string {
  const lines = [
    "# API Configuration",
    `API_BASE_URL=${options.baseUrl}`,
    "",
    "# Emcy Telemetry (optional)",
    "# Set these to enable telemetry to Emcy platform",
    "# EMCY_API_KEY=your-api-key-from-emcy-dashboard",
    "# EMCY_TELEMETRY_URL=http://localhost:5140/api/v1/telemetry",
    "# EMCY_MCP_SERVER_ID=mcp_xxxxxxxxxxxx",
    "# EMCY_DEBUG=false",
    "",
    "# Server Port (for HTTP transport)",
    "PORT=3000",
  ];

  // MCP OAuth configuration - for client authentication to this MCP server
  if (options.oauth2Config?.authorizationServerUrl) {
    lines.push("", "# MCP OAuth 2.0 Configuration (RFC 9728)");
    lines.push("# This MCP server acts as an OAuth Resource Server");
    lines.push(`OAUTH_AUTHORIZATION_SERVER=${options.oauth2Config.authorizationServerUrl}`);
    lines.push("# The public URL of this MCP server (used in Protected Resource Metadata)");
    lines.push("# MCP_RESOURCE_URL=https://your-mcp-server.example.com");
    lines.push("# Set to 'false' to disable OAuth authentication (for development only)");
    lines.push("# MCP_REQUIRE_AUTH=true");
  }

  // Collect unique security schemes used by tools
  const usedSchemes = new Set<string>();
  for (const tool of tools) {
    for (const scheme of tool.securitySchemes) {
      usedSchemes.add(scheme);
    }
  }

  // Add other security credentials (API keys, bearer tokens, etc.)
  const hasNonOAuthSchemes = Array.from(usedSchemes).some(schemeName => {
    const scheme = securitySchemes[schemeName];
    return scheme?.type !== "oauth2";
  });

  if (hasNonOAuthSchemes) {
    lines.push("", "# Security Credentials");

    for (const schemeName of usedSchemes) {
      const scheme = securitySchemes[schemeName];
      const envKey = schemeName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();

      if (scheme?.type === "apiKey") {
        lines.push(`API_KEY_${envKey}=your-api-key`);
      } else if (scheme?.type === "http" && scheme.scheme === "bearer") {
        lines.push(`BEARER_TOKEN_${envKey}=your-bearer-token`);
      }
      // OAuth2 is handled above with the wizard config
    }
  }

  return lines.join("\n");
}

function generateReadme(options: GeneratorOptions): string {
  return `# ${options.name}

MCP Server generated from OpenAPI specification by [Emcy](https://emcy.dev).

## Quick Start

\`\`\`bash
# Install dependencies
npm install

# Build
npm run build

# Run with HTTP transport (for ChatGPT, Cursor, web clients)
npm run start:http

# Or run with stdio transport (for Claude Desktop)
npm start
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and configure:

- \`API_BASE_URL\`: Base URL of the API (default: ${options.baseUrl})
- \`PORT\`: Server port for HTTP transport (default: 3000)
- Security credentials as needed

---

## 🤖 AI Client Configuration

### ChatGPT (OpenAI)

ChatGPT supports MCP servers via Developer Mode. Use the Streamable HTTP transport:

1. Start the server with HTTP transport:
   \`\`\`bash
   npm run start:http
   \`\`\`

2. In ChatGPT Developer Mode, add your MCP server:
   - **URL**: \`http://your-server-url:3000/mcp\`
   - For local development, you'll need to expose via a tunnel (ngrok, cloudflare tunnel, etc.)

### Cursor IDE

Cursor supports both HTTP and stdio transports:

**Option A: HTTP Transport (Recommended)**

Add to your project's \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "${options.name}": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
\`\`\`

Then start the server: \`npm run start:http\`

**Option B: Stdio Transport**

Add to your project's \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "${options.name}": {
      "command": "node",
      "args": ["<absolute-path-to>/build/index.js"]
    }
  }
}
\`\`\`

Restart Cursor after adding the configuration.

### Claude Desktop

Claude Desktop uses stdio transport:

Add to your Claude Desktop config (\`~/Library/Application Support/Claude/claude_desktop_config.json\` on macOS):

\`\`\`json
{
  "mcpServers": {
    "${options.name}": {
      "command": "node",
      "args": ["<absolute-path-to>/build/index.js"]
    }
  }
}
\`\`\`

---

## Transport Endpoints

When running with HTTP transport (\`npm run start:http\`):

| Endpoint | Transport | Description |
|----------|-----------|-------------|
| \`/mcp\` | Streamable HTTP | Modern transport (MCP spec 2025-03-26). **Recommended.** |
| \`/sse\` | Server-Sent Events | Legacy transport for older clients. |
| \`/health\` | - | Health check endpoint. |

---

## Troubleshooting

### "No Resources Found" in Cursor

1. Make sure the server is running: \`npm run start:http\`
2. Check the health endpoint: \`curl http://localhost:3000/health\`
3. Verify your \`mcp.json\` path is correct
4. Restart Cursor after configuration changes
5. Try using stdio transport instead of HTTP

### Connection Errors

1. Ensure the API base URL is correct in \`.env\`
2. Check that required API keys are set in \`.env\`
3. Verify the target API is accessible from your machine

### TypeScript Build Errors

\`\`\`bash
# Clean and rebuild
rm -rf build/
npm run build
\`\`\`
`;
}
