/**
 * Information on the start byte, end byte, and length
 * of a range of bytes.
 */
export interface RangeInfo {
    /**
     * @param startByte the starting byte of the range.
     * @param endByte the last byte of the range.
     * @param length the length of the range.
     */
    startByte:number,
    endByte:number,
    length:number
}

/**
 * Find important information from the user provided range.
 * @param range client provided string range in format
 *  bytes=x-y.
 * @return RangeInfo the start byte, end byte, and length
 *  of the part.
 */
export function getInformationFromRange(range:string):RangeInfo {
    const regExp:RegExp = /^bytes=([0-9]+)-([0-9]+)$/;
    const bytes:RegExpExecArray|null = regExp.exec(range);
    if (bytes == null) {
        throw new Error("Invalid Range provided by client");
    }
    return {
        startByte:parseInt(bytes[1]),
        endByte:parseInt(bytes[2]),
        length:parseInt(bytes[2]) - parseInt(bytes[1])
    }
}