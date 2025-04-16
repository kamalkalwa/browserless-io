/**
 * Interface for a client interacting with the PDF generation API.
 */
export interface IApiClient {
    /**
     * Calls the API to generate a PDF for the given URL.
     * @param url The URL to generate a PDF for.
     * @returns A promise resolving to the raw Fetch API Response object.
     */
    generatePdf(url: string): Promise<Response>;
}