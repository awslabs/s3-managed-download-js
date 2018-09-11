import { ManagedDownloader, ManagedDownloaderOptions, GetObjectStreamInput } from '../../ManagedDownloader';
import * as S3 from 'aws-sdk/clients/s3';
import { getRangeOfPart } from '../../getRangeOfPart';
import { getInformationFromRange } from '../../getInformationFromRange';
import { PassThrough } from 'stream';

const getObjectMockOutput = (contentRange:string, body:Buffer = new Buffer('')) => {
    return {
        promise: () => Promise.resolve({
            Body: body,
            ContentRange:contentRange
        })
    }
}

const getObjectMockError = () => {
    return {
        promise: () => Promise.reject(new Error())
    }
}

describe('ManagedDownloader constructor', () => {

    const Mock = jest.fn<S3>(() => ({
            getObject: jest.fn(() => 
                getObjectMockOutput('bytes=0-0/0')
            )
        })
    );
    const mock = new Mock();

    it('will create an options object with defaults set if no options are provided', () => {
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock);
        expect((managedDownloader as any).maxPartSize)
        .toBe(1024*1024*5);
    });

    it('will set options to provided options', () => {
        const options:ManagedDownloaderOptions = {
            maxPartSize:1024*1024*4
        }
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock, options);
        expect((managedDownloader as any).maxPartSize)
        .toBe(1024*1024*4);
    });

    it('will set options to provided options and defaults if not all options are provided', () => {
        const options:ManagedDownloaderOptions = {}
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock, options);
        expect((managedDownloader as any).maxPartSize)
        .toBe(1024*1024*5);
    });

    it('will throw an error if the client is not provided', () => {
        //@ts-ignore
        expect(() => new ManagedDownloader()).toThrow(Error('S3 client must be provided'));
    });

    it('will throw an error if maximum part size is invalid', () => {
        const options:ManagedDownloaderOptions = {maxPartSize: -1};
        //@ts-ignore
        expect(() => new ManagedDownloader(mock, options)).toThrow(Error('Maximum part size must be a positive number'));
    });

    it('will throw an error if maximum concurrency is invalid', () => {
        const options:ManagedDownloaderOptions = {maxConcurrency: -1};
        //@ts-ignore
        expect(() => new ManagedDownloader(mock, options)).toThrow(Error('Maximum concurrency must be a positive number'));
    });

});

describe('getObjectStream', () => {
    
    it('will properly calculate the range of bytes based'
     + ' on the max part size given a starting part and file length', () => {
        expect.assertions(100);
        const partSize = 1024*10;
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                // random length from 0 to 1000
                let length = Math.floor(Math.random() * 1000);
                expect(getRangeOfPart(i, length, partSize))
                .toBe('bytes=' + i * partSize 
                + '-' + Math.min(((i + 1) * partSize) - 1, length - 1));
            }
        }
    });

    it(`will properly calculate the range of bytes if a byte offset is
    provided`, () => {
        expect.assertions(100);
        const partSize = 1024*10;
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 10; j++) {
                // random length from 0 to 1000
                let length = Math.floor(Math.random() * 1000);
                let byteOffset = Math.floor(Math.random() * 100);
                expect(getRangeOfPart(i, length, partSize, byteOffset))
                .toBe('bytes=' + ((i * partSize) + byteOffset)
                + '-' + Math.min(((i + 1) * partSize) - 1 + byteOffset,
                 length - 1 + byteOffset));
            }
        }
    })

    it(`will properly get information from a user provided range and 
    throw errors if it is in the wrong format`, () => {
        expect(getInformationFromRange('bytes=7-19').startByte).toBe(7);
        expect(getInformationFromRange('bytes=191-1241').endByte).toBe(1241);
        expect(getInformationFromRange('bytes=100-900').length).toBe(800);
        expect(() => getInformationFromRange('sruti')).toThrow(Error);
        expect(() => getInformationFromRange('bytes=199:999')).toThrow(Error);
    })

    it('will return a Promise', () => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist'
        };
        const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn(() => 
                    getObjectMockOutput('bytes=1-10/10')
                )
            })
        );
        const mock = new Mock();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock);
        expect(managedDownloader.getObjectStream(source)).toBeInstanceOf(Promise);
    });

    it('will call getObject with the first range being bytes=0-[maxPartSize-1]', async() => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist',
        };
        const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn(() => 
                    getObjectMockOutput('bytes=0-9/100'))
            })
        );
        const mock = new Mock();
        const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
        managedDownloader.getObjectStream(source);
        expect(mock.getObject).toHaveBeenCalledWith(
            {
                Key:source.Key,
                Bucket:source.Bucket,
                Range:'bytes=0-9'
            }
        );
    });

    it('will properly handle errors thrown by getObject', async() => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist'
        };
        const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn(() => 
                    (
                        {
                            promise: () => 
                                Promise.reject(new Error('Error!'))
                        }
                    )
                )
            })
        );
        let downloadError:Error|undefined;
        const mock = new Mock();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock);
        try {
            await managedDownloader.getObjectStream(source);
        } catch(err) {
            downloadError = err;
        }
        expect(downloadError).toBeInstanceOf(Error);
    });

    it('will not accept a source in the wrong format', async() => {
        //@ts-ignore
        const source:GetObjectStreamInput = {
            //@ts-ignore
            Invalid:'doesntexist.txt',
            Source:'doesntexist'
        };
        const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn(() => 
                    (
                        {
                            promise: () => 
                                Promise.reject(new Error('Error!'))
                        }
                    )
                )
            })
        );
        let downloadError:Error|undefined;
        const mock = new Mock();
        const managedDownloader:ManagedDownloader = new ManagedDownloader(mock);
        try {
            await managedDownloader.getObjectStream(source);
        } catch(err) {
            downloadError = err;
        }
        expect(downloadError).toBeInstanceOf(Error);
    });

    describe('A client can provide a custom range to download', () => {

        it(`will call the downloadByParts function once with the right parameters when
        a client provides the range and it is greater than maxPartSize`, async() => {
            const source:GetObjectStreamInput = {
                Key:'doesntexist.txt',
                Bucket:'doesntexist',
                Range: 'bytes=100-800'
            };
            const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn((source) => 
                        getObjectMockOutput('bytes=0-9/100')
                    )
                })
            );
            const mock = new Mock();
            const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
            const spy = jest.spyOn((managedDownloader as any), 'downloadByParts');
            expect.assertions(2);
            await managedDownloader.getObjectStream(source);
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(PassThrough),
                700,
                100,
                1
            );
        });
    
        it(`will not call downloadByParts if the provided range is less than or equal to maxPartSize`, async() => {
            const source:GetObjectStreamInput = {
                Key:'doesntexist.txt',
                Bucket:'doesntexist',
                Range: 'bytes=10-19'
            };
            const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn((source) => 
                        getObjectMockOutput('bytes=10-19/100')
                    )
                })
            );
            const mock = new Mock();
            const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
            const spy = jest.spyOn((managedDownloader as any), 'downloadByParts');
            expect.assertions(1);
            await managedDownloader.getObjectStream(source);
            expect(spy).toHaveBeenCalledTimes(0);
        });
    });

    describe('A client can provide a part number', () => {
        it('will not call downloadByParts if the part number is provided', async() => {
            const source:GetObjectStreamInput = {
                Key:'doesntexist.txt',
                Bucket:'doesntexist',
                PartNumber: 2
            };
            const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn((source) => 
                    getObjectMockOutput('bytes=0-9/100')
                )
            }));
            const mock = new Mock();
            const managedDownloader = new ManagedDownloader(mock);
            const spy = jest.spyOn((managedDownloader as any), 'downloadByParts');
            expect.assertions(1);
            await managedDownloader.getObjectStream(source);
            expect(spy).toHaveBeenCalledTimes(0);
        });

        it('will call getObject with no range, only PartNumber', async() => {
            const source:GetObjectStreamInput = {
                Key:'doesntexist.txt',
                Bucket:'doesntexist',
                PartNumber: 1
            };
            const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn(() => 
                        getObjectMockOutput('bytes=0-9/100'))
                })
            );
            const mock = new Mock();
            const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
            managedDownloader.getObjectStream(source);
            expect(mock.getObject).toHaveBeenCalledWith(
                {
                    Key:source.Key,
                    Bucket:source.Bucket,
                    PartNumber: 1
                }
            );
        });
    });
});

describe('downloadByParts', () => {

    let originalTimeout:number;

    beforeAll(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
    })

    afterAll(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
    })

    it('will call getObject [numParts = length/maxPartSize] number of times with the proper ranges', async() => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist',
            Range: 'bytes=10-19'
        };
        const stream = new PassThrough();
        const Mock = jest.fn<S3>(() => ({
                getObject: jest.fn(() => 
                    getObjectMockOutput('bytes=0-9/100')
                )
            })
        );
        const mock = new Mock();
        const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
        expect.assertions(2);
        await (managedDownloader as any).downloadByParts(source, stream, 100);
        expect(mock.getObject).toHaveBeenCalledTimes(10);
        expect(mock.getObject).toHaveBeenLastCalledWith(
            {
                Key:source.Key,
                Bucket:source.Bucket,
                Range:'bytes=90-99'
            }
        );
    });

    it('will properly handle errors and stop executing after an error', async() => {
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist',
            Range: 'bytes=10-19'
        };
        const stream = new PassThrough();
        const Mock = jest.fn<S3>(() => ({
            getObject: jest.fn()
            .mockReturnValueOnce(
                getObjectMockOutput('bytes=0-9/100')
            )
            .mockReturnValueOnce(
                getObjectMockOutput('bytes=10-19/100')
            ).mockReturnValue(getObjectMockError())
        }));
        const mock = new Mock();
        const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
        const func = new Promise((resolve, reject) => {
            stream.on('error', (err) => {
                reject(err);
            });
            (managedDownloader as any).downloadByParts(source, stream, 100)
        });
        await expect(func).rejects.toBeInstanceOf(Error);
        expect(mock.getObject).toHaveBeenCalledTimes(3);
    });

    it('will wait until a drain event is fired on the stream before continuing execution', async() => {
        
        const source:GetObjectStreamInput = {
            Key:'doesntexist.txt',
            Bucket:'doesntexist',
            Range: 'bytes=10-19'
        };
        const Mock = jest.fn<S3>(() => ({
            getObject: jest.fn((source) => 
                    getObjectMockOutput('bytes=10-19/50')
                )
            })
        );
        
        const mock = new Mock();
        const streamMock = new PassThrough();
        const falseIndex = Math.floor((Math.random() * 3));
        /**
         * Mock the PassThrough.write() function to return false
         * once in order to test if waitForDrainEvent works
         * properly and execution continues as usual afterwards.
         */
        streamMock.write = jest.fn()
            .mockReturnValueOnce(!(falseIndex == 0))
            .mockReturnValueOnce(!(falseIndex == 1))
            .mockReturnValueOnce(!(falseIndex == 2))
            .mockReturnValueOnce(!(falseIndex == 3))
            .mockReturnValue(true);
        streamMock.end = jest.fn(() => {
            streamMock.emit('end');
        });
        const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10});
        const func = new Promise((resolve, reject) => {
            streamMock
            .on('error', (err) => {
                reject(err);
            })
            .on('end', () => {
                resolve(true);
            });
            (managedDownloader as any).downloadByParts(source, streamMock, 50);
            setTimeout(() => {
                streamMock.emit('drain');
            }, 3000);
        });
        await expect(func).resolves.toBe(true);
        expect(mock.getObject).toHaveBeenCalledTimes(5);
    });

    describe('A client provides a custom range to download', () => {
        it('Will call getObject [numParts = length/maxPartSize] number of times ' 
        + 'with the proper ranges when the client provides a range', async() => {
            
            // client provided range: bytes=199-799
            // the first getObject call will handle 199-248 before downloadByParts
            // therefore downloadByParts starts on the range 249-298
            const source:GetObjectStreamInput = {
                Key:'doesntexist.txt',
                Bucket:'doesntexist',
                Range: 'bytes=249-298'
            };
            const stream = new PassThrough();
            const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn((source) => 
                        getObjectMockOutput('bytes=249-298/800')
                    )
                })
            );
            const mock = new Mock();
            const managedDownloader = new ManagedDownloader(mock, {maxPartSize:50});
            expect.assertions(2);
            // last 2 args are length:600 (799-199) and byteOffset:199 (start byte)
            await (managedDownloader as any).downloadByParts(source, stream, 600, 199);
            expect(mock.getObject).toHaveBeenCalledTimes(12);
            expect(mock.getObject).toHaveBeenLastCalledWith(
                {
                    Key:source.Key,
                    Bucket:source.Bucket,
                    Range:'bytes=749-798'
                }
            );
        });
    });

    describe('A client provides a custom concurrency > 1', () => {
        for (let x = 2; x < 10; x++) {
            it('will write parts to the stream in the correct order', async() => {
                const source:GetObjectStreamInput = {
                    Key:'doesntexist.txt',
                    Bucket:'doesntexist',
                    Range: 'bytes=0-9'
                };
                const getObjectBodyArr = [
                    new Buffer('A'), new Buffer('B'),
                    new Buffer('C'), new Buffer('D'),
                    new Buffer('E')
                ]
                const stream = new PassThrough();
                
                const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn()
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=0-9/100', getObjectBodyArr[0])
                    )
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=10-19/100', getObjectBodyArr[1])
                    )
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=10-19/100', getObjectBodyArr[2])
                    )
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=10-19/100', getObjectBodyArr[3])
                    )
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=10-19/100', getObjectBodyArr[4])
                    )
                }));
                const mock = new Mock();
                const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10, maxConcurrency:x});
                let getObjectBodyIndex = 0;
                const func = new Promise((resolve, reject) => {
                    stream
                    .on('data', (body) => {
                        if (body === getObjectBodyArr[getObjectBodyIndex]) {
                            getObjectBodyIndex++;
                        } else {
                            console.log(body);
                            reject(false);
                        }
                    })
                    .on('end', () => {
                        resolve(true);
                    })
                    .on('error', (err) => {
                        reject(err);
                    });
                    (managedDownloader as any).downloadByParts(source, stream, 50)
                });
                await expect(func).resolves.toBe(true);
                expect(mock.getObject).toHaveBeenCalledTimes(5);
            });
    
            it('will call getObject [numParts = length/maxPartSize] number of times with the proper ranges', async() => {
                const source:GetObjectStreamInput = {
                    Key:'doesntexist.txt',
                    Bucket:'doesntexist',
                    Range: 'bytes=10-19'
                };
                const stream = new PassThrough();
                const Mock = jest.fn<S3>(() => ({
                        getObject: jest.fn(() => 
                            getObjectMockOutput('bytes=0-9/100')
                        )
                    })
                );
                const mock = new Mock();
                const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10, maxConcurrency:x});
                expect.assertions(2);
                await (managedDownloader as any).downloadByParts(source, stream, 100);
                expect(mock.getObject).toHaveBeenCalledTimes(10);
                expect(mock.getObject).toHaveBeenLastCalledWith(
                    {
                        Key:source.Key,
                        Bucket:source.Bucket,
                        Range:'bytes=90-99'
                    }
                );
            });
    
            it('will properly handle errors and stop executing after an error', async() => {
                const source:GetObjectStreamInput = {
                    Key:'doesntexist.txt',
                    Bucket:'doesntexist',
                    Range: 'bytes=10-19'
                };
                const stream = new PassThrough();
                const Mock = jest.fn<S3>(() => ({
                    getObject: jest.fn()
                    .mockReturnValueOnce(
                        getObjectMockOutput('bytes=0-9/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=10-19/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockError()
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=30-39/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=40-49/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=50-59/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=60-69/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=70-79/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=80-89/100', new Buffer('0'))
                    ).mockReturnValueOnce(
                        getObjectMockOutput('bytes=90-99/100', new Buffer('0'))
                    )
                
                }));
                const mock = new Mock();
                const managedDownloader = new ManagedDownloader(mock, {maxPartSize:10, maxConcurrency:x});
                const func = new Promise((resolve, reject) => {
                    let getObjectCounter = 0;
                    stream
                    .on('data', (chunk) => {
                        getObjectCounter++;
                    })
                    .on('error', (err) => {
                        reject(getObjectCounter);
                    });
                    (managedDownloader as any).downloadByParts(source, stream, 100)
                });
                // regardless of the concurrency and the number of
                // getObject requests it makes, it should stop writing after 2
                // because then it will emit an error
                await expect(func).rejects.toBe(2); 
            });
        }
    });
});







