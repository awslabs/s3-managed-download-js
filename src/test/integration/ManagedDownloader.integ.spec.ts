import { ManagedDownloader, GetObjectStreamInput } from '../../ManagedDownloader';
import * as S3 from 'aws-sdk/clients/s3';
import { Stream, Writable } from 'stream';
import * as crypto from 'crypto';

// create an S3 client for use in tests
const s3client:S3 = new S3({region:'us-west-2'});

describe('getObjectStream tests', () => {

    const testBucketName:string = 's3-managed-download-test-bucket' + Date.now();
    const testFileName:string = 's3-managed-download-test.txt';
    let fileChecksum:string|undefined;
    let rangeChecksum:string|undefined;
    let fileLength = 0;
    let originalTimeout:number;

    beforeAll(async() => {
        const entireFileHash:crypto.Hash = crypto.createHash('md5');
        const rangeFileHash:crypto.Hash = crypto.createHash('md5');
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
        let fileBody:string = "";
        const body:string = " test test test ";
        for (let i = 0; i < 1000; i++) {
            fileBody += body;
            fileLength += body.length;
            entireFileHash.update(body);
            if (i >= 200 && i < 800) {
                rangeFileHash.update(body);
            }
        }
        fileChecksum = entireFileHash.digest('hex');
        rangeChecksum = rangeFileHash.digest('hex');
        const params:S3.PutObjectRequest = {
            Bucket: testBucketName,
            Key: testFileName,
            Body: fileBody
        }
        await s3client.createBucket({Bucket:testBucketName}).promise();
        await s3client.waitFor('bucketExists', {Bucket:testBucketName});
        await s3client.putObject(params).promise();
    });

    afterAll(async() => {
        const params:S3.DeleteObjectRequest = {
            Bucket: testBucketName,
            Key: testFileName,
        }
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
        await s3client.deleteObject(params).promise();
        await s3client.deleteBucket({Bucket: testBucketName}).promise();
    });

    it('will return accurate data through the stream', async() => {
        const source:GetObjectStreamInput = {
            Key:testFileName,
            Bucket:testBucketName
        };
        // this maxPartSize option will split the file into 4 parts
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(4, fileLength)});
        let s3Checksum:string;
        let s3Promise = promisifyStreamOutput(
            await managedDownloader.getObjectStream(source));
        s3Checksum = await s3Promise;
        expect(s3Checksum).toBe(fileChecksum);
    });

    it ('will return accurate data through the stream when the file is only 1 part', async() => {
        const source:GetObjectStreamInput = {
            Key:testFileName,
            Bucket:testBucketName
        };
        // this maxPartSize option will split the file into 1 part
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(1, fileLength)});
        let s3Checksum:string;
        let s3Promise = promisifyStreamOutput(
            await managedDownloader.getObjectStream(source));
        s3Checksum = await s3Promise;
        expect(s3Checksum).toBe(fileChecksum);
    });

    it('will return accurate data through the stream when the client provides a range', async() => {
        const source:GetObjectStreamInput = {
            Key:testFileName,
            Bucket:testBucketName,
            Range:"bytes=3200-12800"
        };
        // this maxPartSize option will split the file into 4 parts
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(4, fileLength)});
        let s3Checksum:string;
        let s3Promise = promisifyStreamOutput(
            await managedDownloader.getObjectStream(source));
        s3Checksum = await s3Promise;
        expect(s3Checksum).toBe(rangeChecksum);
    });

    it('will throw an error if the file/bucket does not exist', async() => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist'
        }
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client);
        let downloadError:Error|undefined;
        try {
            await managedDownloader.getObjectStream(source);
        } catch(err) {
            downloadError = err;
        }
        expect(downloadError).toBeInstanceOf(Error);
    });

    describe('getObjectStream client provides part number', () => {

        const multipartFile = 'multipartUpload.txt';
        let partHash:string|undefined;

        beforeAll(async() => {
            const params = {
                Bucket: testBucketName,
                Key: multipartFile,
                Body: ''
            }
            const options = {
                partSize: 5*1024*1024
            }
            let hash:crypto.Hash = crypto.createHash('md5');

            for (let i = 0; i < 5*1024*1024; i++) {
                params.Body += '01';
                if (i >= (5*1024*1024)/2) {
                    hash.update('01');
                }
            }
            partHash = hash.digest('hex');
            await s3client.upload(params, options).promise();
        });

        afterAll(async() => {
            const params = {
                Bucket: testBucketName,
                Key: multipartFile
            }
            await s3client.deleteObject(params).promise();
        });

        it('Will throw an error if the client provides both range and part number', async() => {
            const source:GetObjectStreamInput = {
                Key:multipartFile,
                Bucket:testBucketName,
                PartNumber: 1,
                Range:'bytes=101-202'
            };
            const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client);
            let downloadError:Error|undefined;
            try {
                await managedDownloader.getObjectStream(source);
            } catch(err) {
                downloadError = err;
            }
            expect(downloadError).toBeInstanceOf(Error);
        });

        it('Will throw an error if the part number is out of range', async() => {
            const source:GetObjectStreamInput = {
                Key:multipartFile,
                Bucket:testBucketName,
                PartNumber: 5
            };
            const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client);
            let downloadError:Error|undefined;
            try {
                await managedDownloader.getObjectStream(source);
            } catch(err) {
                downloadError = err;
            }
            expect(downloadError).toBeInstanceOf(Error);
        });

        it(`will return accurate data through the stream when a part number is provided if the file 
        was not uploaded using a multipart uploader`, async() => {
            const source:GetObjectStreamInput = {
                Key:testFileName,
                Bucket:testBucketName,
                PartNumber: 1
            };
            const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(4, fileLength)});
            let s3Checksum:string;
            let s3Promise = promisifyStreamOutput(
                await managedDownloader.getObjectStream(source));
            s3Checksum = await s3Promise;
            expect(s3Checksum).toBe(fileChecksum);
        });

        it('will download given part of file if the file is uploaded using the multipart uploader', async() => {
            const source:GetObjectStreamInput = {
                Key:multipartFile,
                Bucket:testBucketName,
                PartNumber: 2
            };
            const managedDownloader:ManagedDownloader = new ManagedDownloader(s3client, {maxPartSize:1024*4});
            let s3Checksum:string;
            let s3Promise = promisifyStreamOutput(
                await managedDownloader.getObjectStream(source));
            s3Checksum = await s3Promise;
            expect(s3Checksum).toBe(partHash);
        });

    });

    describe('getObjectStream client provides concurrency', () => {
        // the number of parts will range from 2-5 because maxConcurrency can't be less than 1
        const numParts = 4;
        it('will return accurate data through the stream with number of parts less than maxConcurrency', async() => {
            const source:GetObjectStreamInput = {
                Key:testFileName,
                Bucket:testBucketName
            };
            const managedDownloader:ManagedDownloader = 
                new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(Math.floor(numParts/2), fileLength),maxConcurrency:numParts});
            let s3Checksum:string;
            let s3Promise = promisifyStreamOutput(
                await managedDownloader.getObjectStream(source));
            s3Checksum = await s3Promise;
            expect(s3Checksum).toBe(fileChecksum);
        });

        it('will return accurate data through the stream with number of parts equal to maxConcurrency', async() => {
            const source:GetObjectStreamInput = {
                Key:testFileName,
                Bucket:testBucketName
            };
            const managedDownloader:ManagedDownloader = 
                new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(numParts, fileLength),maxConcurrency:numParts});
            let s3Checksum:string;
            let s3Promise = promisifyStreamOutput(
                await managedDownloader.getObjectStream(source));
            s3Checksum = await s3Promise;
            expect(s3Checksum).toBe(fileChecksum);
        });

        it('will return accurate data through the stream with number of parts greater than maxConcurrency', async() => {
            const source:GetObjectStreamInput = {
                Key:testFileName,
                Bucket:testBucketName
            };
            const managedDownloader:ManagedDownloader = 
                new ManagedDownloader(s3client, {maxPartSize:getMaxPartSize(numParts*2, fileLength),maxConcurrency:numParts});
            let s3Checksum:string;
            let s3Promise = promisifyStreamOutput(
                await managedDownloader.getObjectStream(source));
            s3Checksum = await s3Promise;
            expect(s3Checksum).toBe(fileChecksum);
        });
        
    });
    
});

function promisifyStreamOutput(stream:Stream):Promise<string> {
    let hash:crypto.Hash = crypto.createHash('md5');
    return new Promise((resolve:(data:string) => void, 
    reject:(err:Error) => void) => {
        stream
        .on('data', (chunk) => {
            hash.update(chunk, 'utf8');
        })
        .on('end', () => {
            resolve(hash.digest('hex'));
        })
        .on('error', (err) => {
            reject(err);
        });
    });
}

function getMaxPartSize(numParts:number, length:number):number {
    return Math.ceil(length/numParts);
}