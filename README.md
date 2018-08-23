# AWS SDK JavaScript S3 Managed Download

The JavaScript SDK Managed Download can be used for custom S3 downloads. The client can configure options for the Managed Download such as chunk size and number of concurrent transfers.

## Installing

### In Node.js

This package only works in Node.js versions 6+ currently. Use the npm package manager for Node.js to install the Managed Download package. Type the following command in a terminal window.

        npm install @aws/s3-managed-download

## Documentation

You can find the full documentation for the Managed Download package [here](https://awslabs.github.io/s3-managed-download-js/).

## Configuration

You can customize the part size and number of concurrent downloads for the Managed Download by setting the maxPartSize and maxConcurrency options. The maxPartSize option controls the size in bytes of each part of the transfer. The maxConcurrency option specifies the number of parts that will be downloaded in parallel and the maximum number of parts that will be buffered in memory at any time. 

### Import the Managed Download package

You will need an S3 client in order to create a managed download, so import the aws-sdk along with the managed download package.

#### JavaScript

        const S3 = require('aws-sdk/clients/s3');
        const ManagedDownloader = require('@aws/s3-managed-download').ManagedDownloader;

#### TypeScript

        import * as S3 from 'aws-sdk/clients/s3';
        import { ManagedDownloader, GetObjectStreamInput, ManagedDownloaderOptions } from '@aws/s3-managed-download';

### Create a Managed Download with the default part size and concurrency

Create an AWS S3 client and pass the client into the Managed Download constructor to create a Managed Download with a part size of 5MB and concurrency of 1.

#### JavaScript
        
        const s3 = new S3();
        const managedDownloader = new ManagedDownloader(s3);

#### TypeScript

        const s3:S3 = new S3();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3);
        
### Create a Managed Download with custom part size and concurrency

Create an AWS S3 client and Managed Download options. Pass the client and the options into the Managed Download constructor to create a Managed Download with a custom part size of 10MB and concurrency of 5.

#### JavaScript

        const s3 = new S3();
        const options = {
            maxPartSize: 10 * 1024 * 1024,
            maxConcurrency: 5
        };
        const managedDownloader = new ManagedDownloader(s3, options);

#### TypeScript

        const s3:S3 = new S3();
        const options:ManagedDownloaderOptons = {
            maxPartSize: 10 * 1024 * 1024,
            maxConcurrency: 5
        };
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3, options);

## Examples

Currently, the Managed Download only contains a streaming download operation which can work for an entire file or a specific range or part of a file. Here are some examples on
how to use the Managed Download's getObjectStream download operation.


        
### 1. Use the Managed Download object to create a download stream for a file on S3

Get the file 'example-key' from the bucket 'example-bucket' and use the getObjectStream method to create a local file at 'example-file-path'.

#### JavaScript

        const S3 = require('aws-sdk/clients/s3');
        const ManagedDownloader = require('@aws/s3-managed-download').ManagedDownloader;
        const fs = require('fs');

        const s3 = new S3();
        const managedDownloader = new ManagedDownloader(s3);

        const params = {
            Bucket: 'example-bucket',
            Key: 'example-key'
        };
        // create a write stream for a file
        const writeStream = fs.createWriteStream('example-file-path');
        
        managedDownloader.getObjectStream(params)
        .then((stream) => {
            stream.pipe(writeStream);
        }, (err) => {
            writeStream.end();
            console.error(err);
        });

#### TypeScript

        import * as S3 from 'aws-sdk/clients/s3';
        import { ManagedDownloader, GetObjectStreamInput, ManagedDownloaderOptions } from '@aws/s3-managed-download';
        import * as fs from 'fs';

        const s3:S3 = new S3();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3);

        const params:GetObjectStreamInput = {
            Bucket: 'example-bucket',
            Key: 'example-key'
        };
        // create a write stream for a file
        const writeStream:fs.WriteStream = fs.createWriteStream('example-file-path');
        
        managedDownloader.getObjectStream(params)
        .then((stream) => {
            stream.pipe(writeStream);
        }, (err) => {
            writeStream.end();
            console.error(err);
        });

### 2. Use the Managed Download object to create a download stream for a range of bytes of a file on S3

Get the file 'example-key' from the bucket 'example-bucket' and use the getObjectStream method to write to bytes 100-150 of a local file at 'example-file-path'.

#### JavaScript

        const S3 = require('aws-sdk/clients/s3');
        const ManagedDownloader = require('@aws/s3-managed-download').ManagedDownloader;
        const fs = require('fs');
        
        const s3 = new S3();
        const managedDownloader = new ManagedDownloader(s3);

        const params = {
            Bucket: 'example-bucket',
            Key: 'example-key',
            Range: '100-150'
        };
        // create a write stream for a file starting at byte 100
        const writeStream = fs.createWriteStream('example-file-path', {start:100});
        
        managedDownloader.getObjectStream(params)
        .then((stream) => {
            stream.pipe(writeStream);
        }, (err) => {
            writeStream.end();
            console.error(err);
        });

#### TypeScript

        import * as S3 from 'aws-sdk/clients/s3';
        import { ManagedDownloader, GetObjectStreamInput, ManagedDownloaderOptions } from '@aws/s3-managed-download';
        import * as fs from 'fs';

        const s3:S3 = new S3();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(s3);
        
        const params:GetObjectStreamInput = {
            Bucket: 'example-bucket',
            Key: 'example-key',
            Range: '100-150'
        };
        // create a write stream for a file starting at byte 100
        const writeStream:fs.WriteStream = fs.createWriteStream('example-file-path', {start:100});
        
        managedDownloader.getObjectStream(params)
        .then((stream) => {
            stream.pipe(writeStream);
        }, (err) => {
            writeStream.end();
            console.error(err);
        });

## Opening Issues

If you find any bugs or want to request a new feature, please first check the existing issues. If there is not already an issue, then open a new issue. If the issue is regarding a bug, please include the stack trace and a method to recreate it.

## License

This library is licensed under the Apache 2.0 License. 
