export function validateUrlPayload(body: any): string | null {
    if (!body || typeof body !== 'object') {
        return 'Invalid request body: Expected a JSON object.';
    }

    const keys = Object.keys(body);

    if (keys.length === 0) {
        return "Invalid request body: Missing 'url' property.";
    }

    if (keys.length > 1) {
        const extraKeys = keys.filter(key => key !== 'url');
        return `Invalid request body: Unexpected propert${extraKeys.length > 1 ? 'ies' : 'y'}: ${extraKeys.join(', ')}. Only the 'url' property is allowed.`;
    }

    if (keys[0] !== 'url') {
        return `Invalid request body: Unexpected property: ${keys[0]}. Only the 'url' property is allowed.`;
    }

    if (typeof body.url !== 'string' || body.url.trim() === '') {
        return "Invalid request body: 'url' property must be a non-empty string.";
    }

    // Basic URL format check (can be enhanced)
    try {
        new URL(body.url);
    } catch (_) {
        return "Invalid request body: 'url' property must be a valid fully-qualified URL (e.g., https://example.com).";
    }


    return null; // Validation passed
}
