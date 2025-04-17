import { NextRequest, NextResponse } from 'next/server';
import { validateUrlPayload } from '@/lib/validation';
import { ICacheProvider } from '@/interfaces/ICacheProvider';
import { IPdfGenerator, PdfGenerationResult } from '@/interfaces/IPdfGenerator'; // Import PdfGenerationResult
import { RedisFsCacheProvider } from '@/services/RedisFsCacheProvider';
import { BrowserlessPdfGenerator } from '@/services/BrowserlessPdfGenerator';
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

// --- Configuration ---
// Ensure BROWSERLESS_TOKEN and REDIS_URL are loaded (e.g., from .env.local)
const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
const BROWSERLESS_ENDPOINT = `wss://production-sfo.browserless.io?token=${BROWSERLESS_TOKEN}`;
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10); // Default 1 hour

// --- Instantiate Services ---
// In a real app with DI, these would be injected. Here we instantiate them.
// Ensure Redis client is initialized correctly (e.g., singleton from @/lib/redis)
const cacheProvider: ICacheProvider = new RedisFsCacheProvider();

// Only instantiate generator if token exists
let pdfGenerator: IPdfGenerator | null = null;
if (BROWSERLESS_TOKEN) {
    pdfGenerator = new BrowserlessPdfGenerator(BROWSERLESS_ENDPOINT);
} else {
    console.error("FATAL: BROWSERLESS_TOKEN environment variable not set. PDF generation disabled.");
}
// --- End Instantiation ---


export async function POST(req: NextRequest) {
    if (!pdfGenerator) {
        return NextResponse.json(
            { error: 'Server configuration error: PDF generation service unavailable.' },
            { status: 500 }
        );
    }

    let payload: any;
    try {
        payload = await req.json();
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const validationError = validateUrlPayload(payload);
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const url: string = payload.url;
    const cacheKey = url;
    console.log(`API Route: Processing request for URL: ${url}`);

    let pdfCleanup: (() => Promise<void>) | null = null;

    try {
        console.log(`API Route: Checking cache for key: ${cacheKey}`);
        const cachedStream = await cacheProvider.get(cacheKey);

        if (cachedStream) {
            console.log(`API Route: Cache hit for ${url}. Streaming from cache.`);
            // Stream directly from cache
            const headers = new Headers({
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${new URL(url).hostname}.pdf"`,
            });
            cachedStream.on('error', (err) => {
                console.error(`API Route: Error reading cached stream for ${url}:`, err);
            });
            const webStream = Readable.toWeb(cachedStream);
            return new NextResponse(webStream as any, { status: 200, headers });
        }

        console.log(`API Route: Cache miss for ${url}. Generating PDF...`);
        const { stream: pdfSourceStream, cleanup } = await pdfGenerator.generate(url);
        pdfCleanup = cleanup;

        const clientStream = new PassThrough();
        const cacheStream = new PassThrough();

        pdfSourceStream.pipe(clientStream);
        pdfSourceStream.pipe(cacheStream);

        const clientStreamPromise = pipeline(clientStream, new PassThrough());
        const cacheStreamPromise = cacheProvider.set(cacheKey, cacheStream, CACHE_TTL_SECONDS);

        pdfSourceStream.once('error', (err) => {
            console.error(`API Route: Error from PDF source stream for ${url}:`, err);
            clientStream.destroy(err);
            cacheStream.destroy(err);
        });

        cacheStreamPromise
            .then(() => console.log(`API Route: Background cache set succeeded for ${url}.`))
            .catch(cacheErr => console.error(`API Route: Background cache set failed for ${url}:`, cacheErr));

        const headers = new Headers({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${new URL(url).hostname}.pdf"`,
        });
        const webStream = Readable.toWeb(clientStream);
        console.log(`API Route: Streaming generated PDF to client for ${url}.`);

        const response = new NextResponse(webStream as any, { status: 200, headers });

        // Wait for streams to finish *after* returning response, then cleanup.
        // Use Promise.allSettled to ensure cleanup runs even if one stream fails.
        Promise.allSettled([clientStreamPromise, cacheStreamPromise])
            .then((results) => {
                console.log(`API Route: Downstream pipes finished for ${url}. Results:`, results.map(r => r.status));
            })
            .catch((error) => {
                console.error(`API Route: Unexpected error waiting for pipes for ${url}:`, error);
            })
            .finally(() => {
                if (pdfCleanup) {
                    console.log(`API Route: Initiating PDF generator cleanup for ${url}...`);
                    pdfCleanup().catch(cleanupErr => {
                        console.error(`API Route: Error during PDF generator cleanup for ${url}:`, cleanupErr);
                    });
                }
            });

        return response;

    } catch (error: any) {
        console.error(`API Route: Error processing request for ${url}:`, error);
        if (pdfCleanup) {
            console.log(`API Route: Initiating PDF generator cleanup after error for ${url}...`);
            await pdfCleanup().catch(cleanupErr => {
                console.error(`API Route: Error during PDF generator cleanup after error for ${url}:`, cleanupErr);
            });
        }
        return NextResponse.json(
            { error: 'Failed to generate PDF', details: error.message || 'Unknown error' },
            { status: 500 }
        );
    }
}

// Optional: Add GET or other methods if needed, returning 405
export async function GET(req: NextRequest) {
    return new NextResponse(null, { status: 405, statusText: 'Method Not Allowed' });
}
