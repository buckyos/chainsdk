import {ErrorCode} from '../error_code';
import {IReadableKeyValue, IReadWritableKeyValue} from '../chain';
import {BigNumber} from 'bignumber.js';

export class ViewContext {
    constructor(protected kvBalance: IReadableKeyValue) {
        
    }

    async getBalance(address: string): Promise<BigNumber> {
        let retInfo = await this.kvBalance.get(address);
        return retInfo.err === ErrorCode.RESULT_OK ? retInfo.value : new BigNumber(0);
    }
}

export class Context extends ViewContext {
    constructor(kvBalance: IReadWritableKeyValue) {
        super(kvBalance);
    }

    async transferTo(from: string, to: string, amount: BigNumber): Promise<ErrorCode> {
        let fromTotal = await this.getBalance(from);
        if (fromTotal.lt(amount)) {
            return ErrorCode.RESULT_NOT_ENOUGH;
        }
        await (this.kvBalance as IReadWritableKeyValue).set(from, fromTotal.minus(amount));
        await (this.kvBalance as IReadWritableKeyValue).set(to, (await this.getBalance(to)).plus(amount));
        return ErrorCode.RESULT_OK;
    }

    async issue(to: string, amount: BigNumber): Promise<ErrorCode> {
        let sh = await (this.kvBalance as IReadWritableKeyValue).set(to, (await this.getBalance(to)).plus(amount));
        return ErrorCode.RESULT_OK;
    }
}