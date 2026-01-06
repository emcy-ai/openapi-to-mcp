/**
 * Tool Mapper - Maps OpenAPI endpoints to MCP tool definitions
 */
import type { OpenAPIEndpoint, McpToolDefinition } from "./types.js";
/**
 * Map OpenAPI endpoints to MCP tool definitions
 */
export declare function mapToMcpTools(endpoints: OpenAPIEndpoint[], enabledPaths?: Set<string>): McpToolDefinition[];
/**
 * Generate a unique key for an endpoint
 */
export declare function getEndpointKey(endpoint: OpenAPIEndpoint): string;
/**
 * Get all endpoint keys from a list of endpoints
 */
export declare function getAllEndpointKeys(endpoints: OpenAPIEndpoint[]): string[];
//# sourceMappingURL=mapper.d.ts.map