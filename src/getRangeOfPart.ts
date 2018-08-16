/**
 * Get the range of bytes as a string
 * based on the starting part, max
 * part size, and contentLength.
 * @param partNum the part number.
 * @param totalObjectLength length of the file.
 * @param maxPartSize the size of the part.
 * @param byteOffset offset the start and end
 *  by this number. This is necessary for accounting
 *  for the offset when the client provides a range.
 * @return string range in proper format.
 */
export function getRangeOfPart(
    partNum:number, 
    totalObjectLength:number, 
    maxPartSize:number,
    byteOffset:number = 0
):string {
    let range:string = '';
    const startByte:number = (partNum * maxPartSize) + byteOffset;
    const endByte:number = Math.min(totalObjectLength, (partNum + 1) 
    * maxPartSize) + byteOffset;
    // range is inclusive start and end byte so subtract 1
    range = 'bytes=' + startByte + '-' + (endByte - 1);
    return range;
}

