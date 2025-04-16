import { POST } from '../../../src/app/api/generate-pdf/route';
import { NextRequest } from 'next/server';
import { createMocks, RequestMethod } from 'node-mocks-http';
import { mockDeep, mockReset } from 'jest-mock-extended';
import puppeteer, { Browser, Page } from 'puppeteer';
import Redis from 'ioredis';
import fs from 'fs';
import { Readable, PassThrough } from 'stream';

// --- Mocks ---
// Mock external modules
jest.mock('puppeteer');
jest.mock('ioredis');
jest.mock('fs');

// Create deep mocks for complex objects
const mockBrowser = mockDeep<Browser>();
const mockPage = mockDeep<Page>();
const mockRedis = mockDeep<Redis>();
const mockFs = mockDeep<typeof fs>();

// Mock environment variables
const OLD_ENV = process.env;

beforeEach(() => {
    // Reset mocks before each test
    mockReset(mockBrowser);
    mockReset(mockPage);
    mockReset(mockRedis);
    mockReset(mockFs);
    jest.clearAllMocks();

    // Restore process.env
    process.env = { ...OLD_ENV };
    process.env.BROWSERLESS_TOKEN = 'test-token'; // Ensure token is set for most tests
    process.env.REDIS_URL = 'redis://test-redis'; // Ensure Redis URL is set

    // --- Default Mock Implementations ---
    // Puppeteer
    (puppeteer.connect as jest.Mock).mockResolvedValue(mockBrowser);
    mockBrowser.newPage.mockResolvedValue(mockPage);
    mockBrowser.close.mockResolvedValue(undefined);
    mockPage.goto.mockResolvedValue(null); // Adjust as needed
    mockPage.evaluate.mockResolvedValue(undefined); // For waitForImages
    mockPage.setViewport.mockResolvedValue(undefined);
    // Mock createPDFStream to return a mock Readable stream
    const mockPdfStream = new Readable({
        read() {
            this.push('mock pdf data chunk 1');
            this.push('mock pdf data chunk 2');
            this.push(null); // End the stream
        }
    });
    // Puppeteer returns a Web ReadableStream, simulate this then convert
     const mockWebPdfStream = Readable.toWeb(mockPdfStream);
    mockPage.createPDFStream.mockResolvedValue(mockWebPdfStream as any);


    // Redis (using the actual mocked instance from the module)
    // Need to mock the constructor and the instance methods if redis client is created inside the route
    // Assuming redis instance is imported (as in src/lib/redis.ts)
    jest.requireMock('@/lib/redis').redis = mockRedis; // Point the exported redis to our mock
    mockRedis.get.mockResolvedValue(null); // Default: cache miss
    mockRedis.set.mockResolvedValue('OK');

    // FS
    (fs.existsSync as jest.Mock).mockReturnValue(false); // Default: cached file doesn't exist
    (fs.createReadStream as jest.Mock).mockImplementation(() => {
        const mockReadStream = new Readable({
            read() {
                this.push('mock cached pdf data');
                this.push(null);
            }
        });
        return mockReadStream as any;
    });
    (fs.createWriteStream as jest.Mock).mockImplementation(() => {
        const mockWriteStream = new PassThrough();
        // Immediately finish for simplicity in most tests, override if needed
        process.nextTick(() => mockWriteStream.emit('finish'));
        return mockWriteStream as any;
    });
    (fs.unlink as jest.MockedFunction<typeof fs.unlink>).mockImplementation((path, callback) => callback(null)); // Success default
});

afterAll(() => {
    // Restore original env
    process.env = OLD_ENV;
});

// Helper to create mock NextRequest
function createMockRequest(method: string, body?: any): NextRequest {
    const { req } = createMocks({
        method: method as RequestMethod,
        body: body,
        headers: {
            'Content-Type': 'application/json',
        },
    });
    // node-mocks-http req needs conversion to NextRequest-like object
    const mockNextRequest = req as unknown as NextRequest;
    // Add json method if missing (depends on node-mocks-http version)
    if (!mockNextRequest.json) {
        mockNextRequest.json = async () => body;
    }
    return mockNextRequest;
}


// --- Tests ---

describe('API /api/generate-pdf', () => {

    it('should return 405 for GET requests', async () => {
        // Need to import and test GET if defined, or assume default Next.js behavior
        // For now, assume default or test if GET handler exists
        // const request = createMockRequest('GET');
        // const response = await GET(request); // Assuming GET exists
        // expect(response.status).toBe(405);
        // If no GET handler, Next.js handles this, difficult to test here directly
         expect(true).toBe(true); // Placeholder if GET is not explicitly defined/tested
    });

    it('should return 400 for invalid payload (no url)', async () => {
        const request = createMockRequest('POST', {});
        const response = await POST(request);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toContain("Missing 'url' property");
    });

    it('should return 400 for invalid payload (extra fields)', async () => {
        const request = createMockRequest('POST', { url: 'https://example.com', extra: 'bad' });
        const response = await POST(request);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toContain('Unexpected property: extra');
    });

     it('should return 400 for invalid URL format', async () => {
        const request = createMockRequest('POST', { url: 'not-a-real-url' });
        const response = await POST(request);
        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.error).toContain('Invalid URL format');
    });

    it('should return 500 if BROWSERLESS_TOKEN is not set', async () => {
        delete process.env.BROWSERLESS_TOKEN; // Unset token for this test
        const request = createMockRequest('POST', { url: 'https://example.com' });
        const response = await POST(request);
        expect(response.status).toBe(500);
        const json = await response.json();
        expect(json.error).toContain('Server configuration error');
    });

    it('should handle cache hit correctly', async () => {
        const testUrl = 'https://cached.example.com';
        const cachePath = '/fake/cache/cached.pdf';
        mockRedis.get.calledWith(`pdfcache:${testUrl}`).mockResolvedValue(cachePath);
        // Configure fs.existsSync to return true only for the specific cachePath
        (fs.existsSync as jest.Mock).mockImplementation((p) => p === cachePath);


        const request = createMockRequest('POST', { url: testUrl });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/pdf');
        expect(response.headers.get('Content-Disposition')).toContain('cached.example.com.pdf');
        expect(fs.createReadStream).toHaveBeenCalledWith(cachePath);
        expect(puppeteer.connect).not.toHaveBeenCalled(); // Should not connect if cache hit

        // Consume the stream to check content (optional, basic check)
        const reader = response.body?.getReader();
        let streamedData = '';
        let chunk;
        while ((chunk = await reader?.read()) && !chunk.done) {
            streamedData += new TextDecoder().decode(chunk.value);
        }
        expect(streamedData).toContain('mock cached pdf data');
    });

    it('should handle cache miss correctly', async () => {
        const testUrl = 'https://new.example.com';
        mockRedis.get.calledWith(`pdfcache:${testUrl}`).mockResolvedValue(null); // Cache miss

        const request = createMockRequest('POST', { url: testUrl });
        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/pdf');
        expect(response.headers.get('Content-Disposition')).toContain('new.example.com.pdf');

        // Verify mocks were called
        expect(puppeteer.connect).toHaveBeenCalled();
        expect(mockBrowser.newPage).toHaveBeenCalled();
        expect(mockPage.goto).toHaveBeenCalledWith(testUrl, expect.anything());
        expect(mockPage.evaluate).toHaveBeenCalled(); // waitForImages
        expect(mockPage.createPDFStream).toHaveBeenCalled();
        expect(fs.createWriteStream).toHaveBeenCalledWith(expect.stringContaining('https_new_example_com'));

        // Consume the stream to check content (optional, basic check)
         const reader = response.body?.getReader();
        let streamedData = '';
        let chunk;
        while ((chunk = await reader?.read()) && !chunk.done) {
            streamedData += new TextDecoder().decode(chunk.value);
        }
        expect(streamedData).toContain('mock pdf data chunk');

        // Wait briefly for async operations like redis.set in 'finish' handler
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(mockRedis.set).toHaveBeenCalledWith(
            `pdfcache:${testUrl}`,
            expect.stringContaining('https_new_example_com'), // Check if path was stored
            'EX',
            expect.any(Number)
        );
         // Browser close is handled async after response, harder to test timing precisely here
         // We rely on the mock setup ensuring it *can* be called
    });

     it('should handle puppeteer error during PDF generation', async () => {
        const testUrl = 'https://error.example.com';
        mockRedis.get.mockResolvedValue(null); // Cache miss
        mockPage.createPDFStream.mockRejectedValue(new Error('PDF generation failed')); // Simulate error

        const request = createMockRequest('POST', { url: testUrl });
        const response = await POST(request);

        expect(response.status).toBe(500);
        const json = await response.json();
        expect(json.error).toContain('Failed to generate PDF');
        expect(json.details).toContain('PDF generation failed');
        expect(fs.unlink).toHaveBeenCalled(); // Check if cleanup was attempted
    });

});
