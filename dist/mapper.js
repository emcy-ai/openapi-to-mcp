/**
 * Tool Mapper - Maps OpenAPI endpoints to MCP tool definitions
 */
/**
 * Map OpenAPI endpoints to MCP tool definitions
 */
export function mapToMcpTools(endpoints, enabledPaths) {
    return endpoints
        .filter((endpoint) => {
        if (!enabledPaths)
            return true;
        const key = `${endpoint.method}:${endpoint.path}`;
        return enabledPaths.has(key);
    })
        .map((endpoint) => mapEndpointToTool(endpoint));
}
function mapEndpointToTool(endpoint) {
    const inputSchema = buildInputSchema(endpoint);
    // Build description from summary and path
    let description = endpoint.summary || `Executes ${endpoint.method} ${endpoint.path}`;
    if (endpoint.description && endpoint.description !== endpoint.summary) {
        description += `\n\n${endpoint.description}`;
    }
    return {
        name: endpoint.operationId,
        description,
        inputSchema,
        httpMethod: endpoint.method.toLowerCase(),
        pathTemplate: endpoint.path,
        parameters: endpoint.parameters,
        requestBodyContentType: endpoint.requestBody?.contentType,
        securitySchemes: endpoint.securitySchemes,
    };
}
function buildInputSchema(endpoint) {
    const properties = {};
    const required = [];
    // Add parameters to schema
    for (const param of endpoint.parameters) {
        properties[param.name] = {
            ...param.schema,
            description: param.description || param.schema.description,
        };
        if (param.required) {
            required.push(param.name);
        }
    }
    // Add request body to schema
    if (endpoint.requestBody) {
        properties.requestBody = {
            ...endpoint.requestBody.schema,
            description: "The JSON request body.",
        };
        if (endpoint.requestBody.required) {
            required.push("requestBody");
        }
    }
    const schema = {
        type: "object",
        properties,
    };
    if (required.length > 0) {
        schema.required = required;
    }
    return schema;
}
/**
 * Generate a unique key for an endpoint
 */
export function getEndpointKey(endpoint) {
    return `${endpoint.method}:${endpoint.path}`;
}
/**
 * Get all endpoint keys from a list of endpoints
 */
export function getAllEndpointKeys(endpoints) {
    return endpoints.map(getEndpointKey);
}
//# sourceMappingURL=mapper.js.map