import {BigNumber} from 'bignumber.js';

export function toWei(value: string | number | BigNumber): BigNumber {
    return new BigNumber(value).multipliedBy(new BigNumber(10).pow(18));
}

export function fromWei(value: string | number | BigNumber): BigNumber {
    return new BigNumber(value).div(new BigNumber(10).pow(18));
}

export function toCoin(value: string | number | BigNumber): BigNumber {
    return new BigNumber(value).div(new BigNumber(10).pow(18));
}

export function fromCoin(value: string | number | BigNumber): BigNumber {
    return new BigNumber(value).multipliedBy(new BigNumber(10).pow(18));
}
