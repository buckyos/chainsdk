import { DbftBlockHeader, ErrorCode, md5, sign, verify, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection } from '../../../src/client';
import { IOperation } from './baseinterface';
import {BaseCheckPoint} from './checkpoint';

export class GetBalanceCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: string): Promise<ErrorCode> {
        let ret = await baseOp.getBalance(param.address);
        if (ret.eq(new BigNumber(bestRet as string))) {
            return ErrorCode.RESULT_OK;
        }
        console.log(`'${tag}' failed, best ${bestRet} but ${ret.toString()}`);
        return ErrorCode.RESULT_FAILED;
    }
}

export class TransferToCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: number): Promise<ErrorCode> {
        let ret = await baseOp.transferTo(param.to, param.amount);
        if (ret === bestRet) {
            return ErrorCode.RESULT_OK;
        }
        console.log(`'${tag}' failed, best ${bestRet} but ${ret.toString()}`);
        return ErrorCode.RESULT_FAILED;
    }
}

export class RegisterCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: number): Promise<ErrorCode> {
        let ret = await baseOp.register(param.address);
        if (ret === bestRet) {
            return ErrorCode.RESULT_OK;
        }
        console.log(`'${tag}' failed, best ${bestRet} but ${ret.toString()}`);
        return ErrorCode.RESULT_FAILED;
    }
}

export class UnRegisterCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: number): Promise<ErrorCode> {
        let ret = await baseOp.unregister(param.address);
        if (ret === bestRet) {
            return ErrorCode.RESULT_OK;
        }
        console.log(`'${tag}' failed, best ${bestRet} but ${ret.toString()}`);
        return ErrorCode.RESULT_FAILED;
    }
}