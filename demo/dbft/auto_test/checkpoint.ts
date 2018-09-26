import { DbftBlockHeader, ErrorCode} from '../../../src/client';
import { IOperation } from './baseinterface';

export class BaseCheckPoint {
    protected m_newBlock: any;
    protected m_timerid: any;
    constructor() {
        
    }

    public async check(baseOp: IOperation, tag: string, param: any, bestRet: any): Promise<ErrorCode> {
        return await new Promise<ErrorCode>((v) => {
            this.m_newBlock = v;
            setTimeout(() => {
                console.log(`${tag} failed, not new block`);
                this.m_newBlock(ErrorCode.RESULT_FAILED);
                this.m_newBlock = undefined;
            }, param.timeout * 1000);
        });
    }
    public async onTipChange(baseOp: IOperation, blockheader: DbftBlockHeader): Promise<ErrorCode> {
        if (this.m_timerid) {
            clearTimeout(this.m_timerid);
            this.m_timerid = undefined;
        }
        if (this.m_newBlock) {
            this.m_newBlock(ErrorCode.RESULT_OK);
            this.m_newBlock = undefined;
        }
        return ErrorCode.RESULT_OK;
    }
}