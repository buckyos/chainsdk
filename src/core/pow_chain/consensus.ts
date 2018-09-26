import { isNullOrUndefined } from 'util';
const BN = require('bn.js');
import { PowBlockHeader } from './block';
import { Chain } from '../chain';
import * as assert from 'assert';
import { ErrorCode } from '../error_code';

export const INT32_MAX = 0xffffffff;

// 我们测试时保证1分钟一块，每10块调整一次难度

// //每次重新计算难度的间隔块，BTC为2016, 
// export const retargetInterval = 10;

// //每个难度的理想持续时间，BTC为14 * 24 * 60 * 60, 单位和timestamp单位相同，seconds
// export const targetTimespan = 1 * 60;

// //初始bits,BTC为486604799， 对应的hash值为'00000000ffff0000000000000000000000000000000000000000000000000000'
// //我们设定为'0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
// export const basicBits = 520159231;

// //最小难度
// export const limit = new BN('0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'hex');

export function onCheckGlobalOptions(globalOptions: any): boolean {
    if (isNullOrUndefined(globalOptions.retargetInterval)) {
        return false;
    }
    if (isNullOrUndefined(globalOptions.targetTimespan)) {
        return false;
    }
    if (isNullOrUndefined(globalOptions.basicBits)) {
        return false;
    }
    if (isNullOrUndefined(globalOptions.limit)) {
        return false;
    }
    return true;
}

/**
 * Convert a compact number to a big number.
 * Used for `block.bits` -> `target` conversion.
 * @param {Number} compact
 * @returns {BN}
 */

export function fromCompact(compact: number) {
    if (compact === 0) {
        return new BN(0);
    }
        
    const exponent = compact >>> 24;
    const negative = (compact >>> 23) & 1;

    let mantissa = compact & 0x7fffff;
    let num;

    if (exponent <= 3) {
        mantissa >>>= 8 * (3 - exponent);
        num = new BN(mantissa);
    } else {
        num = new BN(mantissa);
        num.iushln(8 * (exponent - 3));
    }

    if (negative) {
        num.ineg();
    }
    
    return num;
}

/**
 * Convert a big number to a compact number.
 * Used for `target` -> `block.bits` conversion.
 * @param {BN} num
 * @returns {Number}
 */

export function toCompact(num: any) {
    if (num.isZero()) {
        return 0;
    }
       
    let exponent = num.byteLength();
    let mantissa;

    if (exponent <= 3) {
        mantissa = num.toNumber();
        mantissa <<= 8 * (3 - exponent);
    } else {
        mantissa = num.ushrn(8 * (exponent - 3)).toNumber();
    }

    if (mantissa & 0x800000) {
        mantissa >>= 8;
        exponent++;
    }

    let compact = (exponent << 24) | mantissa;

    if (num.isNeg()) {
        compact |= 0x800000;
    }
        
    compact >>>= 0;

    return compact;
}

/**
 * Verify proof-of-work.
 * @param {Hash} hash
 * @param {Number} bits
 * @returns {Boolean}
 */

export function verifyPOW(hash: Buffer, bits: number): boolean {
    let target = fromCompact(bits);

    if (target.isNeg() || target.isZero()) {
        return false;
    } 
    let targetHash = target.toBuffer('be', 32);
    return hash.compare(targetHash) < 1;
}

export function retarget(prevbits: number, actualTimespan: number, chain: Chain): number {
    let target = fromCompact(prevbits);

    if (actualTimespan < (chain.globalOptions.targetTimespan / 4 | 0)) {
        actualTimespan = chain.globalOptions.targetTimespan / 4 | 0;
    }

    if (actualTimespan > chain.globalOptions.targetTimespa * 4) {
        actualTimespan = chain.globalOptions.targetTimespan * 4;
    }

    target.imuln(actualTimespan);
    target.idivn(chain.globalOptions.targetTimespan);

    if (target.gt(new BN(chain.globalOptions.limit, 'hex'))) {
        return chain.globalOptions.basicBits;
    }
        
    return toCompact(target);
}

export async function getTarget(header: PowBlockHeader, chain: Chain): Promise<{err: ErrorCode, target?: number}> {
    // Genesis
    if (header.number === 0) {
        return {err: ErrorCode.RESULT_OK, target: chain.globalOptions.basicBits};
    }
    let prevRet = await chain.getHeader(header.preBlockHash);
    // Genesis
    if (!prevRet.header) {
        return {err: ErrorCode.RESULT_INVALID_BLOCK};
    }

    // Do not retarget
    if ((header.number + 1) % chain.globalOptions.retargetInterval !== 0) {
        return {err: ErrorCode.RESULT_OK, target: (prevRet.header as PowBlockHeader).bits};
    }

    // Back 2 weeks
    const height = header.number - (chain.globalOptions.retargetInterval - 1);
    assert(height >= 0);

    let hr = await chain.getHeader(height);
    let retargetFrom: PowBlockHeader;
    if (!hr.err) {
        assert(hr.header);
        retargetFrom = hr.header as PowBlockHeader;
    } else if (hr.err === ErrorCode.RESULT_NOT_FOUND) {
        let ghr = await chain.getHeader(header, -(chain.globalOptions.retargetInterval - 1));
        if (ghr.err) {
            return {err: ghr.err};
        }
        assert(ghr.header);
        retargetFrom = ghr.header as PowBlockHeader;
    } else {
        return {err: hr.err};
    }
    let newTraget = retarget((prevRet.header as PowBlockHeader).bits, prevRet.header.timestamp - retargetFrom.timestamp, chain);
    return {err: ErrorCode.RESULT_OK, target: newTraget};
}