import { IPdfGenerator, PdfGenerationResult } from '@/interfaces/IPdfGenerator';
import puppeteer, { Browser, Page, HTTPRequest } from 'puppeteer';
import { Readable } from 'stream';

const NAVIGATION_TIMEOUT = 90000;
const NETWORK_IDLE_TIMEOUT = 30000;
const SETTLING_DELAY = 1000;
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

async function waitForNetworkIdle(page: Page, timeout: number): Promise<void> {
    console.log(`Network Idle Wait: Starting (timeout: ${timeout}ms)...`);
    const pendingImageRequests = new Set<string>();
    let requestListener: ((req: HTTPRequest) => void) | null = null;
    let finishedListener: ((req: HTTPRequest) => void) | null = null;
    let failedListener: ((req: HTTPRequest) => void) | null = null;

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
                return true;
            }
            return false;
        };

        requestListener = (req: HTTPRequest) => {
            if (req.resourceType() === 'image') {
                pendingImageRequests.add(req.url());
            }
            // Important: Must continue the request when interception is enabled
            req.continue().catch(err => console.error(`Network Idle Wait: Error continuing request ${req.url()}:`, err));
        };

        const requestHandled = (req: HTTPRequest) => {
            if (pendingImageRequests.has(req.url())) {
                pendingImageRequests.delete(req.url());
                setTimeout(() => {
                    checkIdle();
                }, 100);
            }
        };

        finishedListener = (req: HTTPRequest) => {
            requestHandled(req);
        };

        failedListener = (req: HTTPRequest) => {
            console.warn(`Network Idle Wait: Failed image request: ${req.url()} (${req.failure()?.errorText})`);
            requestHandled(req);
        };

        page.on('request', requestListener);
        page.on('requestfinished', finishedListener);
        page.on('requestfailed', failedListener);

        setTimeout(() => checkIdle(), 100);

    });

    try {
        await page.setRequestInterception(true);
        await waitPromise;
    } finally {
        if (requestListener) page.off('request', requestListener);
        if (finishedListener) page.off('requestfinished', finishedListener);
        if (failedListener) page.off('requestfailed', failedListener);
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
            throw new Error("Browserless WSEndpoint is required.");
        }
        this.browserWSEndpoint = browserWSEndpoint;
    }

    async generate(url: string): Promise<PdfGenerationResult> {
        let browser: Browser | null = null;
        let page: Page | null = null;
        console.log(`PDF Generator: Connecting to ${this.browserWSEndpoint.split('?')[0]}...`);

        const cleanup = async (): Promise<void> => {
             if (page) {
                 page.removeAllListeners('error');
                 page.removeAllListeners('pageerror');
                 page.removeAllListeners('request');
                 page.removeAllListeners('requestfinished');
                 page.removeAllListeners('requestfailed');
             }
            if (browser) {
                const browserToClose = browser;
                browser = null;
                console.log(`PDF Generator Cleanup: Closing browser connection for ${url}...`);
                try {
                    await browserToClose.close();
                    console.log(`PDF Generator Cleanup: Browser connection closed for ${url}.`);
                } catch (closeError) {
                    console.error(`PDF Generator Cleanup: Error closing browser for ${url}:`, closeError);
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

            console.log("PDF Generator: Setting Desktop User Agent.");
            await page.setUserAgent(DESKTOP_USER_AGENT);

            console.log("PDF Generator: Setting Desktop Viewport (width: 1280, isMobile: false).");
            await page.setViewport({
                width: 1280,
                height: 800,
                isMobile: false,
            });

            console.log(`PDF Generator: Navigating to ${url} (timeout: ${NAVIGATION_TIMEOUT}ms)...`);
            // Use 'load' to wait for more initial resources.
            await page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT });
            console.log(`PDF Generator: Navigation complete for ${url}. Waiting for network idle (images)...`);

            await waitForNetworkIdle(page, NETWORK_IDLE_TIMEOUT);

            console.log(`PDF Generator: Waiting ${SETTLING_DELAY}ms for page to settle...`);
            await new Promise(resolve => setTimeout(resolve, SETTLING_DELAY));

            console.log("PDF Generator: Emulating 'screen' media type for PDF generation.");
            await page.emulateMediaType('screen');

            console.log(`PDF Generator: Generating PDF stream for ${url} with A3 format...`);
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
            if (error.message?.includes('Execution context is not available')) {
                 throw new Error(`Execution context lost during PDF generation for ${url}. The page might have crashed or navigated away. Original error: ${error.message}`);
            }
            if (error.message?.includes('Target closed')) {
                 throw new Error(`Browser target closed unexpectedly during PDF generation for ${url}. Original error: ${error.message}`);
            }
            throw error;
        }
    }
}