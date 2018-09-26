/*!
 * reader.js - buffer reader for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';
import * as assert from 'assert';
import {Encoding, EncodingError} from './encoding';
import * as digest from './digest';
import {BigNumber} from 'bignumber.js';

const EMPTY = Buffer.alloc(0);

/**
 * An object that allows reading of buffers in a sane manner.
 * @alias module:utils.BufferReader
 * @constructor
 * @param {Buffer} data
 * @param {Boolean?} zeroCopy - Do not reallocate buffers when
 * slicing. Note that this can lead to memory leaks if not used
 * carefully.
 */

export class BufferReader {
    constructor(data: Buffer, zeroCopy?: boolean) {
        if (!(this instanceof BufferReader)) {
            return new BufferReader(data, zeroCopy);

        }
        assert(Buffer.isBuffer(data), 'Must pass a Buffer.');

        this.data = data;
        this.offset = 0;
        this.zeroCopy = zeroCopy || false;
        this.stack = [];
    }

    private data: Buffer;
    private offset: number;
    private zeroCopy: boolean;
    private stack: any[];

    /**
     * Assertion.
     * @param {Boolean} value
     */

    assert(value: any) {
        if (!value) {
            throw new EncodingError(this.offset, 'Out of bounds read', assert);
        }      
    }

    /**
     * Assertion.
     * @param {Boolean} value
     * @param {String} reason
     */

    enforce(value: boolean, reason: string) {
        if (!value) {
            throw new EncodingError(this.offset, reason);
        }
    }

    /**
     * Get total size of passed-in Buffer.
     * @returns {Buffer}
     */

    getSize(): number {
        return this.data.length;
    }

    /**
     * Calculate number of bytes left to read.
     * @returns {Number}
     */

    left(): number {
        this.assert(this.offset <= this.data.length);
        return this.data.length - this.offset;
    }

    /**
     * Seek to a position to read from by offset.
     * @param {Number} off - Offset (positive or negative).
     */

    seek(off: number): number {
        this.assert(this.offset + off >= 0);
        this.assert(this.offset + off <= this.data.length);
        this.offset += off;
        return off;
    }

    /**
     * Mark the current starting position.
     */

    start(): number {
        this.stack.push(this.offset);
        return this.offset;
    }

    /**
     * Stop reading. Pop the start position off the stack
     * and calculate the size of the data read.
     * @returns {Number} Size.
     * @throws on empty stack.
     */

    end(): number {
        assert(this.stack.length > 0);

        const start = this.stack.pop();

        return this.offset - start;
    }

    /**
     * Stop reading. Pop the start position off the stack
     * and return the data read.
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer} Data read.
     * @throws on empty stack.
     */

    endData(zeroCopy?: boolean): Buffer {
        assert(this.stack.length > 0);

        const start = this.stack.pop();
        const end = this.offset;
        const size = end - start;
        const data = this.data;

        if (size === data.length) {
            return data;
        }
            
        if (this.zeroCopy || zeroCopy) {
            return data.slice(start, end);
        }
            
        const ret = Buffer.allocUnsafe(size);
        data.copy(ret, 0, start, end);

        return ret;
    }

    /**
     * Destroy the reader. Remove references to the data.
     */

    destroy(): void {
        this.data = EMPTY;
        this.offset = 0;
        this.stack.length = 0;
    }

    /**
     * Read uint8.
     * @returns {Number}
     */

    readU8(): number {
        this.assert(this.offset + 1 <= this.data.length);
        const ret = this.data[this.offset];
        this.offset += 1;
        return ret;
    }

    /**
     * Read uint16le.
     * @returns {Number}
     */

    readU16(): number {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readUInt16LE(this.offset, true);
        this.offset += 2;
        return ret;
    }

    /**
     * Read uint16be.
     * @returns {Number}
     */

    readU16BE(): number {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readUInt16BE(this.offset, true);
        this.offset += 2;
        return ret;
    }

    /**
     * Read uint32le.
     * @returns {Number}
     */

    readU32(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readUInt32LE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read uint32be.
     * @returns {Number}
     */

    readU32BE(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readUInt32BE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read uint64le as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    readU64(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = Encoding.readU64(this.data, this.offset);
        this.offset += 8;
        return ret;
    }

    /**
     * Read uint64be as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    readU64BE(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = Encoding.readU64BE(this.data, this.offset);
        this.offset += 8;
        return ret;
    }

    /**
     * Read int8.
     * @returns {Number}
     */

    readI8(): number {
        this.assert(this.offset + 1 <= this.data.length);
        const ret = this.data.readInt8(this.offset, true);
        this.offset += 1;
        return ret;
    }

    /**
     * Read int16le.
     * @returns {Number}
     */

    readI16(): number {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readInt16LE(this.offset, true);
        this.offset += 2;
        return ret;
    }

    /**
     * Read int16be.
     * @returns {Number}
     */

    readI16BE(): number {
        this.assert(this.offset + 2 <= this.data.length);
        const ret = this.data.readInt16BE(this.offset, true);
        this.offset += 2;
        return ret;
    }

    /**
     * Read int32le.
     * @returns {Number}
     */

    readI32(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readInt32LE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read int32be.
     * @returns {Number}
     */

    readI32BE(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readInt32BE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read int64le as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    readI64(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = Encoding.readI64(this.data, this.offset);
        this.offset += 8;
        return ret;
    }

    /**
     * Read int64be as a js number.
     * @returns {Number}
     * @throws on num > MAX_SAFE_INTEGER
     */

    readI64BE(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = Encoding.readI64BE(this.data, this.offset);
        this.offset += 8;
        return ret;
    }

    /**
     * Read float le.
     * @returns {Number}
     */

    readFloat(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readFloatLE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read float be.
     * @returns {Number}
     */

    readFloatBE(): number {
        this.assert(this.offset + 4 <= this.data.length);
        const ret = this.data.readFloatBE(this.offset, true);
        this.offset += 4;
        return ret;
    }

    /**
     * Read double float le.
     * @returns {Number}
     */

    readDouble(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = this.data.readDoubleLE(this.offset, true);
        this.offset += 8;
        return ret;
    }

    /**
     * Read double float be.
     * @returns {Number}
     */

    readDoubleBE(): number {
        this.assert(this.offset + 8 <= this.data.length);
        const ret = this.data.readDoubleBE(this.offset, true);
        this.offset += 8;
        return ret;
    }

    /**
     * Read a varint.
     * @returns {Number}
     */

    readVarint(): number {
        const { size, value } = Encoding.readVarint(this.data, this.offset);
        this.offset += size;
        return value;
    }

    /**
     * Read a varint (type 2).
     * @returns {Number}
     */

    readVarint2(): number {
        const { size, value } = Encoding.readVarint2(this.data, this.offset);
        this.offset += size;
        return value;
    }

    /**
     * Read N bytes (will do a fast slice if zero copy).
     * @param {Number} size
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer}
     */

    readBytes(size: number, zeroCopy?: boolean): Buffer {
        assert(size >= 0);
        this.assert(this.offset + size <= this.data.length);

        let ret;
        if (this.zeroCopy || zeroCopy) {
            ret = this.data.slice(this.offset, this.offset + size);
        } else {
            ret = Buffer.allocUnsafe(size);
            this.data.copy(ret, 0, this.offset, this.offset + size);
        }

        this.offset += size;

        return ret;
    }

    /**
     * Read a varint number of bytes (will do a fast slice if zero copy).
     * @param {Bolean?} zeroCopy - Do a fast buffer
     * slice instead of allocating a new buffer (warning:
     * may cause memory leaks if not used with care).
     * @returns {Buffer}
     */

    readVarBytes(zeroCopy?: boolean): Buffer {
        return this.readBytes(this.readVarint(), zeroCopy);
    }

    /**
     * Read a string.
     * @param {String} enc - Any buffer-supported Encoding.
     * @param {Number} size
     * @returns {String}
     */

    readString(enc: string | undefined, size: number): string {
        assert(size >= 0);
        this.assert(this.offset + size <= this.data.length);
        const ret = this.data.toString(enc, this.offset, this.offset + size);
        this.offset += size;
        return ret;
    }

    /**
     * Read a 32-byte hash.
     * @param {String} enc - `"hex"` or `null`.
     * @returns {Hash|Buffer}
     */
    readHash(enc: string): string;
    readHash(): Buffer;
    readHash(enc?: any): any {
        if (enc) {
            return this.readString(enc, 32);
        }  
        return this.readBytes(32);
    }

    /**
     * Read string of a varint length.
     * @param {String} enc - Any buffer-supported Encoding.
     * @param {Number?} limit - Size limit.
     * @returns {String}
     */

    readVarString(enc?: string, limit?: number): string {
        const size = this.readVarint();
        this.enforce(!limit || size <= limit, 'String exceeds limit.');
        return this.readString(enc, size);
    }

    readBigNumber(): BigNumber {
        let str = this.readVarString();
        return new BigNumber(str);
    }

    /**
     * Read a null-terminated string.
     * @param {String} enc - Any buffer-supported Encoding.
     * @returns {String}
     */

    readNullString(enc: string): string {
        this.assert(this.offset + 1 <= this.data.length);

        let i = this.offset;
        for (; i < this.data.length; i++) {
            if (this.data[i] === 0) {
                break;
            }   
        }

        this.assert(i !== this.data.length);

        const ret = this.readString(enc, i - this.offset);

        this.offset = i + 1;

        return ret;
    }

    /**
     * Create a checksum from the last start position.
     * @returns {Number} Checksum.
     */

    createChecksum(): number {
        let start = 0;

        if (this.stack.length > 0) {
            start = this.stack[this.stack.length - 1];
        }
            
        const data = this.data.slice(start, this.offset);

        return digest.hash256(data).readUInt32LE(0, true);
    }

    /**
     * Verify a 4-byte checksum against a calculated checksum.
     * @returns {Number} checksum
     * @throws on bad checksum
     */

    verifyChecksum(): number {
        const chk = this.createChecksum();
        const checksum = this.readU32();
        this.enforce(chk === checksum, 'Checksum mismatch.');
        return checksum;
    }
}
