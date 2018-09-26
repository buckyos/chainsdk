import {BigNumber} from '../src/core';
import { isNull, isNumber, isString, isArray, isObject } from 'util';

const NORMAL_NUMBER = 123;
const NORMAL_STRING = 'scj';
const NORMAL_BUFFER = new Buffer('abef007654321', 'hex');
const NORMAL_BIGNUMBER = new BigNumber(1244);
const __values = [
    NORMAL_NUMBER,  
    NORMAL_STRING,
    NORMAL_BUFFER,
    NORMAL_BIGNUMBER,
    [NORMAL_NUMBER, NORMAL_STRING, NORMAL_BUFFER, NORMAL_BIGNUMBER],
    {
        a: NORMAL_NUMBER,
        b: NORMAL_STRING,
        c: NORMAL_BUFFER,
        d: NORMAL_BIGNUMBER
    }
];

export {__values as values};

function checkValue(prototype: any, value: any): boolean {
    if (typeof prototype !== typeof value) {
        return false;
    }
    if (isNumber(prototype)) {
        return prototype === value;
    }
    if (isString(prototype)) {
        return prototype === value;
    }
    if (prototype instanceof Buffer) {
        if (!(value instanceof Buffer)) {
            return false;
        }
        return prototype.toString('hex') === value.toString('hex');
    }
    if (prototype instanceof BigNumber) {
        if (!(value instanceof BigNumber)) {
            return false;
        }
        return prototype.toString() === value.toString();
    }
    if (isArray(prototype)) {
        if (!isArray(value)) {
            return false;
        }
        if (prototype.length !== value.length) {
            return false;
        }
        for (let i = 0; i < prototype.length; ++i) {
            if (!checkValue(prototype[i], value[i])) {
                return false;
            }
        }
        return true;
    }
    if (isObject(prototype)) {
        if (!isObject(value)) {
            return false;
        }
        let pk = Object.keys(prototype);
        let vk = Object.keys(value);
        if (pk.length !== vk.length) {
            return false;
        }
        for (let i = 0; i < pk.length; ++i) {
            if (pk[i] !== vk[i]) {
                return false;
            }
            if (!checkValue(prototype[pk[i]], value[vk[i]])) {
                return false;
            }
        }
        return true;
    }
    return false;

}

export {checkValue};