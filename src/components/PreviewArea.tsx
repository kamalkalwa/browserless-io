'use client';

import { useEffect, useRef } from 'react';

interface PreviewAreaProps {
    isLoading: boolean;
    error: string | null;
    pdfBlobUrl: string | null;
    progressStageText: string;
    urlForFilename: string; // Used for download filename
}

// Simple Indeterminate Progress Bar Component
const IndeterminateProgressBar = () => (
    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div className="bg-indigo-600 h-2.5 rounded-full animate-indeterminate-progress"></div>
    </div>
);

export default function PreviewArea({
    isLoading,
    error,
    pdfBlobUrl,
    progressStageText,
    urlForFilename
}: PreviewAreaProps) {
    const downloadLinkRef = useRef<HTMLAnchorElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Animation effect for download button pulse
    useEffect(() => {
        if (pdfBlobUrl && downloadLinkRef.current) {
            const button = downloadLinkRef.current;
            // Ensure class is removed before adding to re-trigger animation if needed
            button.classList.remove('animate-pulse-once');
            // Use requestAnimationFrame to ensure the class removal is processed before adding it back
            requestAnimationFrame(() => {
                 button.classList.add('animate-pulse-once');
            });
            // No need for setTimeout cleanup for this specific animation class
        }
    }, [pdfBlobUrl]); // Trigger when pdfBlobUrl changes

    // Attempt to force iframe reload if URL changes but src is the same blob URL instance
    useEffect(() => {
        if (pdfBlobUrl && iframeRef.current) {
            iframeRef.current.src = pdfBlobUrl;
        }
    }, [pdfBlobUrl]);


    const getFilename = () => {
        try {
            const hostname = new URL(urlForFilename).hostname;
            return `${hostname.replace(/^www\./, '') || 'generated'}.pdf`;
        } catch {
            return 'generated.pdf';
        }
    };

    return (
        // Apply base styling to the container
        <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-white rounded-lg shadow-md h-full">
            {/* Loading State */}
            {isLoading && (
                // Apply fade-in animation to the loading container
                <div className="w-full max-w-md text-center animate-fade-in">
                    <IndeterminateProgressBar />
                    <p className="mt-4 text-sm sm:text-base text-gray-600">{progressStageText || 'Processing...'}</p>
                </div>
            )}

            {/* Error State */}
            {!isLoading && error && (
                // Apply slide-fade-in animation to the error container
                <div className="w-full p-4 bg-red-100 border border-red-400 text-red-700 rounded animate-slide-fade-in">
                    <p className="font-bold">Error:</p>
                    <p>{error}</p>
                </div>
            )}

            {/* Success State: Preview & Download */}
            {!isLoading && pdfBlobUrl && !error && (
                // Apply fade-scale-in animation to the success container
                <div className="w-full h-full flex flex-col items-center animate-fade-scale-in">
                    <div className="w-full flex justify-center mb-4">
                         <a
                            ref={downloadLinkRef}
                            href={pdfBlobUrl}
                            download={getFilename()}
                            // Add hover effect class
                            className="inline-block px-5 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition transform hover:scale-105"
                            // pulse-once animation is added via useEffect
                        >
                            Download PDF
                        </a>
                    </div>
                    <iframe
                        ref={iframeRef}
                        src={pdfBlobUrl}
                        title="PDF Preview"
                        className="w-full h-[60vh] sm:h-[70vh] border border-gray-300 rounded"
                    >
                        Your browser does not support embedded PDFs. Please use the download link.
                    </iframe>

                </div>
            )}

            {/* Initial Placeholder State */}
            {!isLoading && !error && !pdfBlobUrl && (
                 // Apply fade-in animation to the placeholder
                 <div className="text-center text-gray-400 animate-fade-in">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>Enter a URL and click 'Generate PDF'.</p>
                    <p>The preview will appear here.</p>
                </div>
            )}
        </div>
    );
}