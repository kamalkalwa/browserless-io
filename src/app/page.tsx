'use client';

import { useState, useEffect, useRef } from 'react';
import UrlInputForm from '@/components/UrlInputForm'; // Assuming path
import PreviewArea from '@/components/PreviewArea'; // Create this component
import { IApiClient } from '@/interfaces/IApiClient';
import { PdfApiClient } from '@/services/PdfApiClient';

const apiClient: IApiClient = new PdfApiClient();

// --- Simulated Progress ---
const progressStages = [
    "Connecting...",
    "Navigating page...",
    "Waiting for resources...",
    "Generating PDF...",
];
const stageDuration = 5000; // ms per stage (adjust as needed)
// ---

export default function Home() {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
    const [progressStageText, setProgressStageText] = useState<string>('');
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const currentStageIndexRef = useRef<number>(0);

    // Clean up Object URL
    useEffect(() => {
        const currentUrl = pdfBlobUrl;
        return () => {
            if (currentUrl) {
                console.log("Revoking Object URL:", currentUrl);
                URL.revokeObjectURL(currentUrl);
            }
        };
    }, [pdfBlobUrl]);

    // Manage Simulated Progress Timer
    useEffect(() => {
        if (isLoading) {
            currentStageIndexRef.current = 0;
            setProgressStageText(progressStages[0]); // Start immediately

            progressIntervalRef.current = setInterval(() => {
                currentStageIndexRef.current++;
                if (currentStageIndexRef.current < progressStages.length) {
                    setProgressStageText(progressStages[currentStageIndexRef.current]);
                } else {
                    // Keep showing the last stage if process takes longer than simulation
                    // Or clear interval: if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                }
            }, stageDuration);

        } else {
            // Clear interval and reset text when not loading
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
            }
            setProgressStageText('');
        }

        // Cleanup interval on component unmount
        return () => {
            if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
            }
        };
    }, [isLoading]);


    const handleGeneratePdf = async (submittedUrl: string) => {
        setIsLoading(true);
        setError(null);
        setPdfBlobUrl(null); // Clear previous result

        try {
            const response = await apiClient.generatePdf(submittedUrl);

            if (!response.ok) {
                let errorMsg = `Error: ${response.status} ${response.statusText}`;
                try {
                    const errorJson = await response.json();
                    errorMsg = errorJson.error || errorJson.message || errorMsg;
                } catch (e) { /* Ignore */ }
                throw new Error(errorMsg);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(objectUrl);

        } catch (err: any) {
            console.error("Form submission error:", err);
            setError(err.message || 'An unexpected error occurred.');
            setPdfBlobUrl(null);
        } finally {
            setIsLoading(false); // This will also stop the progress simulation timer
        }
    };

    return (
        <main className="flex min-h-screen flex-col md:flex-row items-stretch justify-center p-4 sm:p-8 md:p-12 bg-gradient-to-br from-gray-100 to-blue-100">
            {/* Left Column: Input Form */}
            <div className="w-full md:w-1/3 lg:w-1/4 md:pr-4 lg:pr-8 flex-shrink-0 mb-6 md:mb-0">
                 <UrlInputForm
                    isLoading={isLoading}
                    onSubmit={handleGeneratePdf}
                 />
            </div>

            {/* Right Column: Dynamic Area (Placeholder, Loader, Preview, Error) */}
            <div className="w-full md:w-2/3 lg:w-3/4 md:pl-4 lg:pl-8 flex flex-col">
                 <PreviewArea
                    isLoading={isLoading}
                    error={error}
                    pdfBlobUrl={pdfBlobUrl}
                    progressStageText={progressStageText}
                    urlForFilename={url} // Pass URL for download filename
                 />
            </div>
        </main>
    );
}
