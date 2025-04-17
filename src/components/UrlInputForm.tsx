'use client';

import { useState, FormEvent } from 'react';

interface UrlInputFormProps {
    isLoading: boolean;
    onSubmit: (url: string) => Promise<void>;
}

export default function UrlInputForm({ isLoading, onSubmit }: UrlInputFormProps) {
    const [url, setUrl] = useState<string>('');

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isLoading && url) {
            onSubmit(url);
        }
    };

    return (
        <div className="p-6 sm:p-8 space-y-6 bg-white rounded-lg shadow-md h-full">
            <h1 className="text-xl sm:text-2xl font-bold text-center text-gray-800">Generate PDF from URL</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="urlInput" className="block text-sm font-medium text-gray-700">
                        Website URL
                    </label>
                    <input
                        id="urlInput"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com"
                        required
                        disabled={isLoading}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed text-gray-900"
                    />
                </div>
                <button
                    type="submit"
                    disabled={isLoading || !url}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105"
                >
                    {isLoading ? (
                        <>
                            Generating...
                        </>
                    ) : (
                        'Generate PDF'
                    )}
                </button>
            </form>
        </div>
    );
}
