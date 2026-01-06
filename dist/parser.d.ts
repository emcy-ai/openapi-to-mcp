/**
 * OpenAPI Parser - Parses OpenAPI 3.x specs and extracts endpoint information
 */
import type { ParsedOpenAPI } from './types.js';
/**
 * Parse an OpenAPI specification from a string (JSON or YAML) or URL
 */
export declare function parseOpenAPI(input: string | object): Promise<ParsedOpenAPI>;
/**
 * Validate an OpenAPI specification
 */
export declare function validateOpenAPI(input: string | object): Promise<{
    valid: boolean;
    errors?: string[];
}>;
//# sourceMappingURL=parser.d.ts.map