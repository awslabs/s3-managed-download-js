import { PassThrough } from 'stream';

/**
 * ManagedDownloaderStream is a PassThrough
 * stream to pass data from S3 to a client
 * and contain useful headers.
 */
export class ManagedDownloaderStream extends PassThrough {
    /**
     * @param mimeType MIME type describing format of the data.
     * @param contentLength length of the body in bytes.
     */
    mimeType:string|undefined;
    contentLength:number|undefined;
}