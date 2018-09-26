import { DbftBlockHeader, ErrorCode, md5, sign, verify, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection } from '../../../src/client';
import { IOperation } from './baseinterface';
import {BaseCheckPoint} from './checkpoint';

export class NewProcessCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: { id: string, command: string, argv?: string[]}, bestRet: any): Promise<ErrorCode> {
        let ret = await baseOp.newProcess(param.id, param.command, param.argv ? param.argv : []);
        if (ret) {
            console.log(`'${tag}' failed, newProcess failed, errcode=${ret}`);
            return ErrorCode.RESULT_FAILED;
        }
        return await new Promise<ErrorCode>((v) => {
            setTimeout(() => {
                v(ErrorCode.RESULT_OK);
            }, 5000);
        });
    }
}

export class KillProcessCheckPoint extends BaseCheckPoint {
    public async check(baseOp: IOperation, tag: string, param: {id: string}, bestRet: any): Promise<ErrorCode> {
        let ret = await baseOp.killProcess(param.id);
        if (ret) {
            console.log(`'${tag}' failed, killProcess failed, errcode=${ret}`);
            return ErrorCode.RESULT_FAILED;
        }
        return await new Promise<ErrorCode>((v) => {
            setTimeout(() => {
                v(ErrorCode.RESULT_OK);
            }, 5000);
        });
    }
}