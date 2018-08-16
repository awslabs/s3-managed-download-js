import { PassThrough } from 'stream';

/**
 * ManagedDownloadStream is a PassThrough
 * stream to pass data from S3 to a client
 * and contain useful headers.
 */
export class ManagedDownloadStream extends PassThrough {
    /**
     * @param mimeType MIME type describing format of the data.
     * @param contentLength length of the body in bytes.
     */
    mimeType:string|undefined;
    contentLength:number|undefined;
}