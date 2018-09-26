/*!
 * staticwriter.js - buffer writer for bcoin
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

import * as assert from 'assert';

import { Encoding } from './encoding';
import * as digest from './digest';

const EMPTY = Buffer.alloc(0);
const POOLSIZE = 100 << 10;

let POOL: any = null;

/**
 * Statically allocated buffer writer.
 * @alias module:utils.StaticWriter
 * @constructor
 * @param {Number} size
 */

export class StaticWriter {
    private data: Buffer;
    private offset: number;
    constructor(size: number) {
        if (!(this instanceof StaticWriter)) {
            return new StaticWriter(size);
        }

        this.data = size ? Buffer.allocUnsafe(size) : EMPTY;
        this.offset = 0;
    }

    /**
     * Allocate writer from preallocated 100kb pool.
     * @param {Number} size
     * @returns {StaticWriter}
     */

    public static pool(size: number) {
        if (size <= POOLSIZE) {
            if (!POOL) {
                POOL = Buffer.allocUnsafeSlow(POOLSIZE);
            }

            const bw = new StaticWriter(0);
            bw.data = POOL.slice(0, size);
            return bw;
        }

        return new StaticWriter(size);
    }

    /**
     * Allocate and render the final buffer.
     * @returns {Buffer} Rendered buffer.
     */

    public render() {
        const data = this.data;
        assert(this.offset === data.length);
        this.destroy();
        return data;
    }

    /**
     * Get size of data written so far.
     * @returns {Number}
     */

    public getSize() {
        return this.offset;
    }

    /**
     * Seek to relative offset.
     * @param {Number} offset
     */

    public seek(offset: number) {
        this.offset += offset;
    }

    /**
     * Destroy the buffer writer.
     */

    public destroy() {
        this.data = EMPTY;
        this.offset = 0;
    }

    /**
     * Write uint8.
     * @param {Number} value
     */

    public writeU8(value: number) {
        this.offset = this.data.writeUInt8(value, this.offset, true);
    }

    /**
     * Write uint16le.
     * @param {Number} value
     */

    public writeU16(value: number) {
        this.offset = this.data.writeUInt16LE(value, this.offset, true);
    }

    /**
     * Write uint16be.
     * @param {Number} value
     */

    public writeU16BE(value: number) {
        this.offset = this.data.writeUInt16BE(value, this.offset, true);
    }

    /**
     * Write uint32le.
     * @param {Number} value
     */

    public writeU32(value: number) {
        this.offset = this.data.writeUInt32LE(value, this.offset, true);
    }

    /**
     * Write uint32be.
     * @param {Number} value
     */

    public writeU32BE(value: number) {
        this.offset = this.data.writeUInt32BE(value, this.offset, true);
    }

    /**
     * Write uint64le.
     * @param {Number} value
     */

    public writeU64(value: number) {
        this.offset = Encoding.writeU64(this.data, value, this.offset);
    }

    /**
     * Write uint64be.
     * @param {Number} value
     */

    public writeU64BE(value: number) {
        this.offset = Encoding.writeU64BE(this.data, value, this.offset);
    }

    /**
     * Write int8.
     * @param {Number} value
     */

    public writeI8(value: number) {
        this.offset = this.data.writeInt8(value, this.offset, true);
    }

    /**
     * Write int16le.
     * @param {Number} value
     */

    public writeI16(value: number) {
        this.offset = this.data.writeInt16LE(value, this.offset, true);
    }

    /**
     * Write int16be.
     * @param {Number} value
     */

    public writeI16BE(value: number) {
        this.offset = this.data.writeInt16BE(value, this.offset, true);
    }

    /**
     * Write int32le.
     * @param {Number} value
     */

    public writeI32(value: number) {
        this.offset = this.data.writeInt32LE(value, this.offset, true);
    }

    /**
     * Write int32be.
     * @param {Number} value
     */

    public writeI32BE(value: number) {
        this.offset = this.data.writeInt32BE(value, this.offset, true);
    }

    /**
     * Write int64le.
     * @param {Number} value
     */

    public writeI64(value: number) {
        this.offset = Encoding.writeI64(this.data, value, this.offset);
    }

    /**
     * Write int64be.
     * @param {Number} value
     */

    public writeI64BE(value: number) {
        this.offset = Encoding.writeI64BE(this.data, value, this.offset);
    }

    /**
     * Write float le.
     * @param {Number} value
     */

    public writeFloat(value: number) {
        this.offset = this.data.writeFloatLE(value, this.offset, true);
    }

    /**
     * Write float be.
     * @param {Number} value
     */

    public writeFloatBE(value: number) {
        this.offset = this.data.writeFloatBE(value, this.offset, true);
    }

    /**
     * Write double le.
     * @param {Number} value
     */

    public writeDouble(value: number) {
        this.offset = this.data.writeDoubleLE(value, this.offset, true);
    }

    /**
     * Write double be.
     * @param {Number} value
     */

    public writeDoubleBE(value: number) {
        this.offset = this.data.writeDoubleBE(value, this.offset, true);
    }

    /**
     * Write a varint.
     * @param {Number} value
     */

    public writeVarint(value: number) {
        this.offset = Encoding.writeVarint(this.data, value, this.offset);
    }

    /**
     * Write a varint (type 2).
     * @param {Number} value
     */

    public writeVarint2(value: number) {
        this.offset = Encoding.writeVarint2(this.data, value, this.offset);
    }

    /**
     * Write bytes.
     * @param {Buffer} value
     */

    public writeBytes(value: Buffer) {
        if (value.length === 0) {
            return;
        }

        value.copy(this.data, this.offset);

        this.offset += value.length;
    }

    /**
     * Write bytes with a varint length before them.
     * @param {Buffer} value
     */

    public writeVarBytes(value: Buffer) {
        this.writeVarint(value.length);
        this.writeBytes(value);
    }

    /**
     * Copy bytes.
     * @param {Buffer} value
     * @param {Number} start
     * @param {Number} end
     */

    public copy(value: Buffer, start: number, end: number) {
        const len = end - start;

        if (len === 0) {
            return;
        }

        value.copy(this.data, this.offset, start, end);
        this.offset += len;
    }

    /**
     * Write string to buffer.
     * @param {String} value
     * @param {String?} enc - Any buffer-supported encoding.
     */

    public writeString(value: string, enc?: string) {
        if (value.length === 0) {
            return;
        }

        const size = Buffer.byteLength(value, enc);

        this.data.write(value, this.offset, undefined, enc);

        this.offset += size;
    }

    /**
     * Write a 32 byte hash.
     * @param {Hash} value
     */

    public writeHash(value: Buffer | string) {
        if (typeof value !== 'string') {
            assert(value.length === 32);
            this.writeBytes(value);
            return;
        }
        assert(value.length === 64);
        this.data.write(value, this.offset, undefined, 'hex');
        this.offset += 32;
    }

    /**
     * Write a string with a varint length before it.
     * @param {String}
     * @param {String?} enc - Any buffer-supported encoding.
     */

    public writeVarString(value: string, enc?: string) {
        if (value.length === 0) {
            this.writeVarint(0);
            return;
        }

        const size = Buffer.byteLength(value, enc);

        this.writeVarint(size);
        this.data.write(value, this.offset, undefined, enc);

        this.offset += size;
    }

    /**
     * Write a null-terminated string.
     * @param {String|Buffer}
     * @param {String?} enc - Any buffer-supported encoding.
     */

    public writeNullString(value: string, enc?: string) {
        this.writeString(value, enc);
        this.writeU8(0);
    }

    /**
     * Calculate and write a checksum for the data written so far.
     */

    public writeChecksum() {
        const data = this.data.slice(0, this.offset);
        const hash = digest.hash256(data);
        hash.copy(this.data, this.offset, 0, 4);
        this.offset += 4;
    }

    /**
     * Fill N bytes with value.
     * @param {Number} value
     * @param {Number} size
     */

    public fill(value: number, size: number) {
        assert(size >= 0);

        if (size === 0) {
            return;
        }

        this.data.fill(value, this.offset, this.offset + size);
        this.offset += size;
    }
}
