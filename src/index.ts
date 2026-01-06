/**
 * Emcy OpenAPI to MCP Generator
 * 
 * Converts OpenAPI specifications to MCP servers with optional Emcy telemetry.
 */

export { parseOpenAPI, validateOpenAPI } from './parser.js';
export { mapToMcpTools, getEndpointKey, getAllEndpointKeys } from './mapper.js';
export { generateMcpServer } from './generator.js';

export type {
  OpenAPIEndpoint,
  ParsedOpenAPI,
  McpToolDefinition,
  GeneratorOptions,
  GeneratedFiles,
  EndpointParameter,
  SecurityScheme,
} from './types.js';

