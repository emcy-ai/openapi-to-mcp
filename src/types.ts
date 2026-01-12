/**
 * Types for OpenAPI to MCP conversion
 */

export interface OpenAPIEndpoint {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters: EndpointParameter[];
  requestBody?: RequestBodySchema;
  securitySchemes: string[];
  tags: string[];
}

export interface EndpointParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: JSONSchemaType;
  description?: string;
}

export interface RequestBodySchema {
  required: boolean;
  contentType: string;
  schema: JSONSchemaType;
}

export interface JSONSchemaType {
  type?: string | string[];
  format?: string;
  properties?: Record<string, JSONSchemaType>;
  items?: JSONSchemaType;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JSONSchemaType;
  oneOf?: JSONSchemaType[];
  anyOf?: JSONSchemaType[];
  allOf?: JSONSchemaType[];
  $ref?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchemaType;
  httpMethod: string;
  pathTemplate: string;
  parameters: EndpointParameter[];
  requestBodyContentType?: string;
  securitySchemes: string[];
}

export interface ParsedOpenAPI {
  title: string;
  version: string;
  description?: string;
  baseUrl?: string;
  endpoints: OpenAPIEndpoint[];
  securitySchemes: Record<string, SecurityScheme>;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

export interface GeneratorOptions {
  name: string;
  version?: string;
  baseUrl: string;
  enabledEndpoints?: Set<string>;  // Optional: filter to only these operationIds
  emcyEnabled?: boolean;
  /**
   * For local development: path to local @emcy/sdk package.
   * When set, generated package.json will use "file:<path>" instead of npm version.
   * Example: "../../packages/emcy-sdk" or "/absolute/path/to/emcy-sdk"
   */
  localSdkPath?: string;
  /**
   * MCP OAuth 2.0 configuration for client authentication.
   * The MCP server acts as an OAuth Resource Server (RFC 9728).
   * Clients (like ChatGPT) authenticate via the specified Authorization Server.
   */
  oauth2Config?: {
    /** The Authorization Server URL that issues tokens for this MCP server */
    authorizationServerUrl?: string;
    /** Scopes supported by this MCP server */
    scopes?: string[];
  };
}

export interface GeneratedFiles {
  [path: string]: string;
}

