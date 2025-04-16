import { IApiClient } from '@/interfaces/IApiClient';

export class PdfApiClient implements IApiClient {
    private apiBaseUrl: string;

    // Allow overriding base URL for testing or different environments
    constructor(apiBaseUrl: string = '/api') {
        this.apiBaseUrl = apiBaseUrl;
    }

    async generatePdf(url: string): Promise<Response> {
        const endpoint = `${this.apiBaseUrl}/generate-pdf`;
        console.log(`API Client: Sending request to ${endpoint} for URL: ${url}`);

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url }),
            });
            console.log(`API Client: Received response status ${response.status} for ${url}`);
            return response; // Return the raw response
        } catch (error) {
            console.error(`API Client: Network or fetch error for ${url}:`, error);
            // Re-throw or return a custom error response object
            throw error;
        }
    }
}