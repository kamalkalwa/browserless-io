import { Readable } from 'stream';

/**
 * Represents the result of a PDF generation operation.
 */
export interface PdfGenerationResult {
    /** The readable stream of the generated PDF content. */
    stream: Readable;
    /** A function to be called to clean up resources (e.g., close the browser). */
    cleanup: () => Promise<void>;
}

/**
 * Interface for a service that generates a PDF stream from a URL.
 */
export interface IPdfGenerator {
    /**
     * Generates a PDF from the given URL.
     * @param url The fully-qualified URL to generate a PDF from.
     * @returns A promise that resolves with an object containing the PDF stream and a cleanup function.
     * @throws Error if PDF generation fails.
     */
    generate(url: string): Promise<PdfGenerationResult>;
}