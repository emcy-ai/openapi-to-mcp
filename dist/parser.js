/**
 * OpenAPI Parser - Parses OpenAPI 3.x specs and extracts endpoint information
 */
import SwaggerParser from '@apidevtools/swagger-parser';
/**
 * Parse an OpenAPI specification from a string (JSON or YAML) or URL
 */
export async function parseOpenAPI(input) {
    // Dereference resolves all $ref pointers
    const api = await SwaggerParser.dereference(input);
    return extractFromSpec(api);
}
/**
 * Validate an OpenAPI specification
 */
export async function validateOpenAPI(input) {
    try {
        await SwaggerParser.validate(input);
        return { valid: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { valid: false, errors: [message] };
    }
}
function extractFromSpec(api) {
    const endpoints = [];
    const securitySchemes = {};
    // Extract security schemes
    const components = api.components;
    if (components?.securitySchemes) {
        for (const [name, scheme] of Object.entries(components.securitySchemes)) {
            if (!isReference(scheme)) {
                securitySchemes[name] = extractSecurityScheme(scheme);
            }
        }
    }
    // Extract base URL from servers
    const baseUrl = api.servers?.[0]?.url || '';
    // Extract endpoints from paths
    if (api.paths) {
        for (const [path, pathItem] of Object.entries(api.paths)) {
            if (!pathItem || isReference(pathItem))
                continue;
            const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
            for (const method of methods) {
                const operation = pathItem[method];
                if (!operation)
                    continue;
                const endpoint = extractEndpoint(path, method.toUpperCase(), operation, pathItem.parameters);
                endpoints.push(endpoint);
            }
        }
    }
    return {
        title: api.info.title,
        version: api.info.version,
        description: api.info.description,
        baseUrl,
        endpoints,
        securitySchemes,
    };
}
function extractEndpoint(path, method, operation, pathParameters) {
    const parameters = [];
    // Combine path-level and operation-level parameters
    const allParams = [...(pathParameters || []), ...(operation.parameters || [])];
    for (const param of allParams) {
        if (isReference(param))
            continue;
        parameters.push(extractParameter(param));
    }
    // Extract request body
    let requestBody;
    if (operation.requestBody && !isReference(operation.requestBody)) {
        requestBody = extractRequestBody(operation.requestBody);
    }
    // Extract security requirements
    const securitySchemes = [];
    const security = operation.security || [];
    for (const req of security) {
        securitySchemes.push(...Object.keys(req));
    }
    // Generate operationId if not present
    const operationId = operation.operationId || generateOperationId(method, path);
    return {
        operationId,
        method,
        path,
        summary: operation.summary,
        description: operation.description,
        parameters,
        requestBody,
        securitySchemes,
        tags: operation.tags || [],
    };
}
function extractParameter(param) {
    return {
        name: param.name,
        in: param.in,
        required: param.required || false,
        schema: param.schema || { type: 'string' },
        description: param.description,
    };
}
function extractRequestBody(body) {
    const content = body.content;
    // Prefer JSON content type
    const jsonContent = content?.['application/json'];
    if (jsonContent?.schema) {
        return {
            required: body.required || false,
            contentType: 'application/json',
            schema: jsonContent.schema,
        };
    }
    // Fallback to first available content type
    const [contentType, mediaType] = Object.entries(content || {})[0] || [];
    if (contentType && mediaType?.schema) {
        return {
            required: body.required || false,
            contentType,
            schema: mediaType.schema,
        };
    }
    return undefined;
}
function extractSecurityScheme(scheme) {
    const result = {
        type: scheme.type,
    };
    if (scheme.type === 'apiKey') {
        result.name = scheme.name;
        result.in = scheme.in;
    }
    else if (scheme.type === 'http') {
        result.scheme = scheme.scheme;
        result.bearerFormat = scheme.bearerFormat;
    }
    else if (scheme.type === 'oauth2' && 'flows' in scheme) {
        result.flows = scheme.flows;
    }
    else if (scheme.type === 'openIdConnect' && 'openIdConnectUrl' in scheme) {
        result.openIdConnectUrl = scheme.openIdConnectUrl;
    }
    return result;
}
function generateOperationId(method, path) {
    // Convert path like /users/{id}/posts to UsersIdPosts
    const pathParts = path
        .split('/')
        .filter(Boolean)
        .map(part => {
        if (part.startsWith('{') && part.endsWith('}')) {
            return 'By' + capitalize(part.slice(1, -1));
        }
        return capitalize(part);
    })
        .join('');
    return capitalize(method.toLowerCase()) + pathParts;
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function isReference(obj) {
    return typeof obj === 'object' && obj !== null && '$ref' in obj;
}
//# sourceMappingURL=parser.js.map