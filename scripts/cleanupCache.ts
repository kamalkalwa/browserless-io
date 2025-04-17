import fs from 'fs/promises';
import path from 'path';
import { redis } from '@/lib/redis';

const CACHE_DIR = path.join(process.cwd(), '.pdfcache');
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '3600', 10);
// Add a buffer to TTL to avoid race conditions (e.g., 10 minutes)
const CLEANUP_BUFFER_SECONDS = 600;
const MAX_AGE_MS = (CACHE_TTL_SECONDS + CLEANUP_BUFFER_SECONDS) * 1000;


async function cleanupOrphanedCacheFiles() {
    console.log(`Starting cache cleanup for directory: ${CACHE_DIR}`);
    console.log(`Max file age: ${MAX_AGE_MS / 1000} seconds`);

    let filesDeleted = 0;
    let filesChecked = 0;

    try {
                try {
            await fs.access(CACHE_DIR);
        } catch (accessError) {
            console.log('Cache directory does not exist. Nothing to clean.');
            return;
        }

        const files = await fs.readdir(CACHE_DIR);
        filesChecked = files.length;
        console.log(`Found ${filesChecked} files to check.`);

        const now = Date.now();

        for (const file of files) {
            if (!file.endsWith('.pdf')) {
                console.log(`Skipping non-pdf file: ${file}`);
                continue;
            }

            const filePath = path.join(CACHE_DIR, file);

            try {
                const stats = await fs.stat(filePath);
                const fileAgeMs = now - stats.mtimeMs;

                if (fileAgeMs > MAX_AGE_MS) {
                    console.log(`Deleting old file (${Math.round(fileAgeMs / 1000)}s old): ${filePath}`);
                    await fs.unlink(filePath);
                    filesDeleted++;
                }
                // Optional: More robust check - query Redis if ANY key points to this filePath.
                // This is more complex as it requires scanning Redis values or maintaining an index.
                // For simplicity, age-based cleanup is often sufficient.

            } catch (statOrUnlinkError: any) {
                if (statOrUnlinkError.code === 'ENOENT') {
                    // File might have been deleted between readdir and stat/unlink, ignore.
                    console.log(`File not found during cleanup (likely already deleted): ${filePath}`);
                } else {
                    console.error(`Error processing file ${filePath}:`, statOrUnlinkError);
                }
            }
        }

        console.log(`Cache cleanup finished. Checked: ${filesChecked}, Deleted: ${filesDeleted}.`);

    } catch (error) {
        console.error('Error during cache cleanup process:', error);
    } finally {
        // Ensure Redis connection is closed if the script is standalone
        if (redis && typeof redis.quit === 'function') {
            await redis.quit();
            console.log("Redis connection closed.");
        } else if (redis && typeof redis.disconnect === 'function') {
             redis.disconnect();
             console.log("Redis connection disconnected.");
        }
    }
}

cleanupOrphanedCacheFiles().catch(err => {
    console.error("Unhandled error in cleanup script:", err);
    process.exit(1);
});