/**
 * The ManagedDownloader uses an s3 client for custom efficient
 * downloads from s3.
 */
import * as S3 from 'aws-sdk/clients/s3';
import { getRangeOfPart } from './getRangeOfPart';
import { getInformationFromRange } from './getInformationFromRange';
import { ManagedDownloaderStream } from './ManagedDownloaderStream';

/**
 * Custom options for the Managed Download.
 */
export interface ManagedDownloaderOptions {
    /**
     * @param maxPartSize size of a part in bytes.
     * @param maxConcurrency number of parts to download
     *  in parallel.
     */
    maxPartSize?:number,
    maxConcurrency?:number
}

/**
 * Parameter type for the getObjectStream function.
 */
export interface GetObjectStreamInput {
    /**
     * @param Bucket S3 bucket of a file.
     * @param Key key of a file in an S3 bucket.
     * @param Range range of bytes to download
     *  in format 'bytes=([0-9]+)-([0-9]+)'.
     * @param PartNumber part number of file to download.
     *  This option is useful for files uploaded using
     *  the multipart uploader. Other files will only have
     *  1 part.
     */
    Bucket:string,
    Key:string,
    Range?:string,
    PartNumber?:number
}

/**
 * The ManagedDownloader class handles custom S3 downloads. 
 * A client can set options for the download such as
 * the part size and the concurrency.
 */
export class ManagedDownloader {

    /**
     * @param maxPartSize max part size of download in bytes.
     * @param maxConcurrency maximum parallel downloads.
     */
    private readonly maxPartSize:number
    private readonly maxConcurrency:number

    /**
     * Create a ManagedDownloader object with an
     * s3 client and custom options if provided.
     *
     * @param client an S3 client to make requests.
     * @param options configuration for the managed download.
     * @throws Error if the client is not provided.
     * @throws Error if maxPartSize is not a positive number.
     * @throws Error if concurrency is not a positive number.
     */
    constructor(private readonly client:S3, options:ManagedDownloaderOptions = {}) {
        if (!client) {
            throw new Error('S3 client must be provided');
        }
        if (
            (options && options.maxPartSize !== undefined) &&
            (typeof options.maxPartSize !== "number" || options.maxPartSize < 1)
        ) {
            throw new Error(
                'Maximum part size must be a positive number'
            );
        }
        if (
            (options && options.maxConcurrency !== undefined) &&
            (typeof options.maxConcurrency !== "number" || options.maxConcurrency < 1)
        ) {
            throw new Error(
                'Maximum concurrency must be a positive number'
            );
        }
        this.maxPartSize = options.maxPartSize || 1024*1024*5;
        this.maxConcurrency = options.maxConcurrency || 1;
    }

    /**
     * Get a download stream for a file stored in s3.
     * Download the first part of size [maxPartSize] to get 
     * the content length and set headers for the stream.
     * If the file length is less than [maxPartSize], or the
     * client provides a part number, then return the stream.
     * If not, call downloadByParts to split the rest of the file into 
     * parts of size [maxPartSize] and download [maxConcurrency] parts
     * in parallel.
     * @param params an object in the format
     *  {
     *      Bucket:string,
     *      Key:string, 
     *      Range(optional):string,
     *      PartNumber(optional):number
     *  }.
     * @return ManagedDownloaderStream the PassThrough stream to read
     *  file data from.
     * @throws Error if params is in the incorrect format.
     */
    async getObjectStream(
        params: GetObjectStreamInput
    ):Promise<ManagedDownloaderStream> {
        const destinationStream = new ManagedDownloaderStream();
        let contentLength;
        let byteOffset;
        if (typeof(params) !== 'object' || !params.Bucket || !params.Key) {
            throw new Error(
                `expected an object in the format {Bucket:string, Key:string,
                Range(optional):string, PartNumber(optional):number},
                received ${params}`);
        }
        if (params.Range && !params.PartNumber) {
            const rangeInfo = getInformationFromRange(params.Range);
            contentLength = rangeInfo.length;
            byteOffset = rangeInfo.startByte;
            params.Range = getRangeOfPart(
                0, contentLength, 
                this.maxPartSize, byteOffset
            );
        } else if (!params.PartNumber) {
            params.Range = 'bytes=0-' + (this.maxPartSize - 1);
        }
        const getObjectData:S3.GetObjectOutput = 
            await this.client.getObject(params).promise();
        contentLength = contentLength || 
            parseInt(getObjectData.ContentRange!.split('/')[1]);
        destinationStream.mimeType = getObjectData.ContentType;
        destinationStream.contentLength = contentLength;
        destinationStream.write(getObjectData.Body);
        if (contentLength > this.maxPartSize 
            && !params.PartNumber) {
            this.downloadByParts(
                params, destinationStream, 
                contentLength, byteOffset, 1
            );
        } else {
            destinationStream.end();
        }
        return destinationStream;
    }

    /**
     * Download the individual parts of the file
     * and write them to the stream sequentially.
     * Download n = this.maxConcurrency parts 
     * in parallel and store parts which 
     * aren't the next part in memory until the
     * stream is ready to read it.
     * 
     * @param params params object contains the bucket
     *  and key.
     * @param destinationStream the ManagedDownloaderStream stream
     *  transferring the parts of a file.
     * @param contentLength the length of the file.
     * @param byteOffset if available, the amount to add to start
     *  and end byte when calculating the range.
     * @param startingPart the part number to start downloading from.
     */
    private async downloadByParts(
        params:GetObjectStreamInput,
        destinationStream:ManagedDownloaderStream,
        contentLength:number,
        byteOffset:number = 0,
        startingPart:number = 0
    ):Promise<void> {
        const numParts:number = Math.ceil(
            contentLength/this.maxPartSize
        );
        const queue:Promise<S3.GetObjectOutput>[] = [];
        let numDownloads = 0;
        let currentPart = startingPart;
        while (numDownloads < numParts - startingPart) {
            try {
                const numRequests = Math.min(
                    this.maxConcurrency - queue.length,
                    numParts - currentPart
                );
                for (let i = 0; i < numRequests; i++) {
                    params.Range = getRangeOfPart(
                        currentPart, contentLength, this.maxPartSize, byteOffset
                    );
                    queue.push(
                        this.client.getObject(params).promise()
                    );
                    currentPart++;
                }
                const result:S3.GetObjectOutput = await queue.shift()!;
                if (!destinationStream.write(result.Body)) {
                    await this.waitForDrainEvent(destinationStream);
                };
                numDownloads++;
            } catch(err) {
                destinationStream.emit('error', err);
                return;
            }
        }
        destinationStream.end();
    }

    /**
     * wait for a stream to emit a 
     * drain event when it is ready to
     * receive data again.
     * @param destinationStream the stream
     *  that is being watched for the drain
     *  event.
     */
    private waitForDrainEvent(
        destinationStream:ManagedDownloaderStream
    ):Promise<void> {
        return new Promise((resolve) => {
            destinationStream.once('drain', () => {
                resolve();
            });
        });
    }
}

