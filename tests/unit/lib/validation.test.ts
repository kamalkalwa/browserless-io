import { validateUrlPayload } from '../../../src/lib/validation';

describe('validateUrlPayload', () => {
  it('should return null for a valid payload', () => {
    const body = { url: 'https://example.com' };
    expect(validateUrlPayload(body)).toBeNull();
  });

  it('should return error for empty body', () => {
    expect(validateUrlPayload({})).toContain("Missing 'url' property");
  });

  it('should return error for null body', () => {
    expect(validateUrlPayload(null)).toContain('Invalid request body');
  });

  it('should return error for non-object body', () => {
    expect(validateUrlPayload('string')).toContain('Invalid request body');
  });

  it('should return error for payload with extra properties', () => {
    const body = { url: 'https://example.com', extra: 'value' };
    expect(validateUrlPayload(body)).toContain('Unexpected property: extra');
  });

  it('should return error for payload with multiple extra properties', () => {
    const body = { url: 'https://example.com', extra1: 'v1', extra2: 'v2' };
    expect(validateUrlPayload(body)).toContain('Unexpected properties: extra1, extra2');
  });

  it('should return error if only property is not url', () => {
    const body = { wrong: 'https://example.com' };
    expect(validateUrlPayload(body)).toContain('Unexpected property: wrong');
  });

  it('should return error for non-string url', () => {
    const body = { url: 123 };
    expect(validateUrlPayload(body)).toContain("'url' property must be a non-empty string");
  });

  it('should return error for empty string url', () => {
    const body = { url: '  ' };
    expect(validateUrlPayload(body)).toContain("'url' property must be a non-empty string");
  });

  it('should return error for invalid URL format', () => {
    const body = { url: 'not-a-valid-url' };
    expect(validateUrlPayload(body)).toContain('must be a valid fully-qualified URL');
  });

   it('should return null for valid URL with path and query', () => {
    const body = { url: 'https://example.com/path?query=value' };
    expect(validateUrlPayload(body)).toBeNull();
  });
});
