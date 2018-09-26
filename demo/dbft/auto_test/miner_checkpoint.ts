import { DbftBlockHeader, ErrorCode, md5, sign, verify, addressFromSecretKey, ValueTransaction, parseCommand, initUnhandledRejection } from '../../../src/client';
import { IOperation } from './baseinterface';
import {BaseCheckPoint} from './checkpoint';

export class MinerCheckPoint extends BaseCheckPoint {
    protected m_v: any;
    protected m_n: number = -1;
    protected m_bestRet: any;
    protected m_tag: string = '';
    
    protected reset() {
        this.m_v = undefined;
        this.m_n = -1;
        this.m_bestRet = undefined;
        this.m_tag = 'undefined';
    }
    
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: {miner: string, count: number}): Promise<ErrorCode> {
        let ret = await baseOp.getMiners();
        if (ret.err) {
            console.log(`'${tag}' failed, getMiners failed, errcode=${ret.err}, check`);
            return ErrorCode.RESULT_FAILED;
        }
        for (let m of ret.miners!) {
            if (m === bestRet.miner) {
                return ErrorCode.RESULT_OK;
            }
        }

        this.m_bestRet = bestRet;
        this.m_tag = tag;
        return await new Promise<ErrorCode>((v) => {
            this.m_v = v;
        });
    }

    public async onTipChange(baseOp: IOperation, blockheader: DbftBlockHeader): Promise<ErrorCode> {
        if (this.m_n === -1) {
            this.m_n = blockheader.number;
            return ErrorCode.RESULT_OK;
        }

        let ret = await baseOp.getMiners();
        if (ret.err) {
            this.reset();
            console.log(`'${this.m_tag}' failed, getMiners failed, errcode=${ret.err}, onTipChange`);
            return ErrorCode.RESULT_FAILED;
        }
        for (let m of ret.miners!) {
            if (m === this.m_bestRet.miner) {
                this.reset();
                this.m_v(ErrorCode.RESULT_OK);
                return ErrorCode.RESULT_OK;
            }
        }

        if (blockheader.number - this.m_n >= this.m_bestRet.count) {
            console.log(`'${this.m_tag}' failed, not find ${this.m_bestRet.miner} in miners`);
            this.reset();
            this.m_v(ErrorCode.RESULT_FAILED);
        }

        return ErrorCode.RESULT_OK;
    }
}

export class UnMinerCheckPoint extends BaseCheckPoint {
    protected m_v: any;
    protected m_n: number = -1;
    protected m_bestRet: any;
    protected m_tag: string = '';
    
    protected reset() {
        this.m_v = undefined;
        this.m_n = -1;
        this.m_bestRet = undefined;
        this.m_tag = 'undefined';
    }
    public async check(baseOp: IOperation, tag: string, param: any, bestRet: {miner: string, count: number}): Promise<ErrorCode> {
        this.m_bestRet = bestRet;
        this.m_tag = tag;
        return await new Promise<ErrorCode>((v) => {
            this.m_v = v;
        });
    }

    public async onTipChange(baseOp: IOperation, blockheader: DbftBlockHeader): Promise<ErrorCode> {
        if (this.m_n === -1) {
            this.m_n = blockheader.number;
            return ErrorCode.RESULT_OK;
        }

        let ret = await baseOp.getMiners();
        if (ret.err) {
            this.reset();
            console.log(`'${this.m_tag}' failed, getMiners failed, errcode=${ret.err}, onTipChange`);
            return ErrorCode.RESULT_FAILED;
        }

        if (blockheader.number - this.m_n >= this.m_bestRet.count) {
            for (let m of ret.miners!) {
                if (m === this.m_bestRet.miner) {
                    console.log(`'${this.m_tag}' failed, ${this.m_bestRet.miner} in miners after ${this.m_bestRet.count} blocks`);
                    this.reset();
                    this.m_v(ErrorCode.RESULT_FAILED);
                    return ErrorCode.RESULT_OK;
                }
            }
            
            this.reset();
            this.m_v(ErrorCode.RESULT_OK);
        }

        return ErrorCode.RESULT_OK;
    }
}