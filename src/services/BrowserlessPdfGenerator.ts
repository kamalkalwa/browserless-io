import { IPdfGenerator, PdfGenerationResult } from '@/interfaces/IPdfGenerator';
import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import { Readable } from 'stream';

// --- Configuration ---
const NAVIGATION_TIMEOUT = 90000;
// Timeout for waiting for network requests to settle after initial load
const NETWORK_IDLE_TIMEOUT = 30000; // 30 seconds
// How often to check if network is idle
const NETWORK_POLL_INTERVAL = 500; // 500 ms
const SETTLING_DELAY = 1000;
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'; // Example Desktop Chrome User Agent

// --- Helper Function waitForNetworkIdle ---
// Waits for network requests (specifically images) to finish
async function waitForNetworkIdle(page: Page, timeout: number): Promise<void> {
    console.log(`Network Idle Wait: Starting (timeout: ${timeout}ms)...`);
    const pendingImageRequests = new Set<string>();
    let requestListener: ((req: HTTPRequest) => void) | null = null;
    let finishedListener: ((req: HTTPRequest) => void) | null = null;
    let failedListener: ((req: HTTPRequest) => void) | null = null;

    // Promise to manage listener cleanup and resolution/rejection
    const waitPromise = new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            console.warn(`Network Idle Wait: Timeout (${timeout}ms) reached. Pending images: ${pendingImageRequests.size}`);
            // Resolve instead of rejecting to allow PDF generation attempt even if some images hang
            resolve();
        }, timeout);

        const checkIdle = () => {
            if (pendingImageRequests.size === 0) {
                clearTimeout(timeoutId);
                console.log("Network Idle Wait: No pending image requests detected.");
                resolve();
                return true; // Idle state reached
            }
            return false; // Not idle
        };

        requestListener = (req: HTTPRequest) => {
            if (req.resourceType() === 'image') {
                // console.log(`Network Idle Wait: Pending image request added: ${req.url()}`);
                pendingImageRequests.add(req.url());
            }
            // Important: Must continue the request when interception is enabled
            req.continue().catch(err => console.error(`Network Idle Wait: Error continuing request ${req.url()}:`, err));
        };

        const requestHandled = (req: HTTPRequest) => {
            if (pendingImageRequests.has(req.url())) {
                // console.log(`Network Idle Wait: Pending image request removed: ${req.url()}`);
                pendingImageRequests.delete(req.url());
                // Check if idle after handling this request
                // Use setTimeout to allow potential new requests triggered by this one to register
                setTimeout(() => {
                    if (!checkIdle()) {
                         // Optional: Add polling check here if needed, but often event-driven is enough
                    }
                }, 100); // Small delay
            }
        };

        finishedListener = (req: HTTPRequest) => {
            // console.log(`Network Idle Wait: Finished: ${req.url()}`);
            requestHandled(req);
        };

        failedListener = (req: HTTPRequest) => {
            console.warn(`Network Idle Wait: Failed image request: ${req.url()} (${req.failure()?.errorText})`);
            requestHandled(req); // Still handle (remove) failed requests
        };

        // Attach listeners
        page.on('request', requestListener);
        page.on('requestfinished', finishedListener);
        page.on('requestfailed', failedListener);

        // Initial check in case navigation already finished loading everything quickly
        setTimeout(() => checkIdle(), 100);

    });

    try {
        // Enable request interception before the wait starts
        await page.setRequestInterception(true);
        await waitPromise; // Wait for the network to become idle or timeout
    } finally {
        // Cleanup: Remove listeners and disable interception
        if (requestListener) page.off('request', requestListener);
        if (finishedListener) page.off('requestfinished', finishedListener);
        if (failedListener) page.off('requestfailed', failedListener);
        // Disable interception only if it was successfully enabled
        try {
            await page.setRequestInterception(false);
            console.log("Network Idle Wait: Request interception disabled.");
        } catch (interceptError) {
            console.error("Network Idle Wait: Error disabling request interception:", interceptError);
        }
    }
}

export class BrowserlessPdfGenerator implements IPdfGenerator {
    private browserWSEndpoint: string;

    constructor(browserWSEndpoint: string) {
        if (!browserWSEndpoint) {
            throw new Error("BrowserlessPdfGenerator requires a browserWSEndpoint.");
        }
        this.browserWSEndpoint = browserWSEndpoint;
    }

    async generate(url: string): Promise<PdfGenerationResult> {
        let browser: Browser | null = null;
        let page: Page | null = null;
        console.log(`PDF Generator: Connecting to ${this.browserWSEndpoint.split('?')[0]}...`);

        const cleanup = async (): Promise<void> => {
             // Ensure page listeners are removed if page exists
             if (page) {
                 page.removeAllListeners('error');
                 page.removeAllListeners('pageerror');
                 page.removeAllListeners('requestfailed');
                 // Also remove network idle listeners if they were somehow left attached
                 page.removeAllListeners('request');
                 page.removeAllListeners('requestfinished');
                 page.removeAllListeners('requestfailed');
             }
            if (browser) {
                const browserToClose = browser; // Capture instance in case browser is reassigned
                browser = null; // Prevent multiple close attempts from this function
                console.log(`PDF Generator Cleanup: Closing browser connection for ${url}...`);
                try {
                    await browserToClose.close();
                    console.log(`PDF Generator Cleanup: Browser connection closed for ${url}.`);
                } catch (closeError) {
                    console.error(`PDF Generator Cleanup: Error closing browser for ${url}:`, closeError);
                    // Decide if you need to re-throw or just log
                }
            } else {
                 console.log(`PDF Generator Cleanup: Browser already closed or null for ${url}.`);
            }
        };

        try {
            browser = await puppeteer.connect({
                browserWSEndpoint: this.browserWSEndpoint,
            });
            console.log("PDF Generator: Connected to Browserless.");

            page = await browser.newPage();
            page.on('error', err => console.error(`PDF Generator: Page error for ${url}:`, err));
            page.on('pageerror', pageErr => console.error(`PDF Generator: Uncaught page exception for ${url}:`, pageErr));

            // --- APPLY VIEWPORT AND USER AGENT BEFORE NAVIGATION ---
            console.log("PDF Generator: Setting Desktop User Agent.");
            await page.setUserAgent(DESKTOP_USER_AGENT);

            console.log("PDF Generator: Setting Desktop Viewport (width: 1280, isMobile: false).");
            await page.setViewport({
                width: 1280,
                height: 800, // Height matters less for layout but good to set
                isMobile: false, // Explicitly set to false
                // deviceScaleFactor: 1 // Ensure default device scale factor
            });
            // --- END CHANGES ---


            console.log(`PDF Generator: Navigating to ${url} (timeout: ${NAVIGATION_TIMEOUT}ms)...`);
            await page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT });
            console.log(`PDF Generator: Navigation complete for ${url}. Waiting for network idle (images)...`);

            await waitForNetworkIdle(page, NETWORK_IDLE_TIMEOUT);

            console.log(`PDF Generator: Waiting ${SETTLING_DELAY}ms for page to settle...`);
            await new Promise(resolve => setTimeout(resolve, SETTLING_DELAY));

            console.log("PDF Generator: Emulating 'screen' media type for PDF generation.");
            await page.emulateMediaType('screen');

            console.log(`PDF Generator: Generating PDF stream for ${url}...`);
            let pdfStream: any;
            try {
                 pdfStream = await page.createPDFStream({
                    format: 'A3',
                    printBackground: true,
                    timeout: 60000
                });
            } catch (pdfError: any) {
                 console.error(`PDF Generator: Error directly during page.createPDFStream for ${url}:`, pdfError);
                 throw pdfError;
            }

            const nodeStream = Readable.fromWeb(pdfStream as any);

            console.log(`PDF Generator: Returning PDF stream and cleanup function for ${url}.`);
            return { stream: nodeStream, cleanup };

        } catch (error: any) {
            console.error(`PDF Generator: Error during PDF generation process for ${url}:`, error);
            await cleanup();
            if (error.message?.includes('Timeout') && error.message?.includes('waiting for image event')) {
                 throw new Error(`Failed to load all images within timeout for ${url}. Original error: ${error.message}`);
            }
            if (error.message?.includes('Error loading image')) {
                 throw new Error(`Failed to load at least one image for ${url}. Original error: ${error.message}`);
            }
            // ... other specific error re-throws ...
            if (error.message?.includes('Execution context is not available')) { /* ... */ }
            if (error.message?.includes('Target closed')) { /* ... */ }
            throw error;
        }
    }
}