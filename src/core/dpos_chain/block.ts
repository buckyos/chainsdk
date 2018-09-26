import * as assert from 'assert';

import { ErrorCode } from '../error_code';

import {BlockWithSign, ValueBlockHeader, Chain} from '../value_chain';
import { DposChain } from './chain';

//  出块计算从1开始，假设重新选举周期为100：
//  第一周期为1-100 
// 第二周期为101-200
// 以此类推

export class DposBlockHeader extends BlockWithSign(ValueBlockHeader) {
    public async verify(chain: Chain): Promise<{ err: ErrorCode, valid?: boolean }> {
        // 先验证签名是否正确
        if (!this._verifySign()) {
            chain.logger.error(`verify block ${this.number} sign error!`);
            return { err: ErrorCode.RESULT_OK, valid: false };
        }
        // 从某个设施验证pubkey是否在列表中,是否轮到这个节点出块
        return await this._verifyMiner(chain);
    }

    public async getTimeIndex(chain: Chain): Promise<{err: ErrorCode, index?: number}> {
        let hr = await chain.getHeader(0);
        if (hr.err) {
            return {err: hr.err};
        }
        // TODO: 可以兼容一些误差?
        let offset = this.timestamp - hr.header!.timestamp;
        if (offset < 0) {
            chain.logger.error(`error offset ${offset}, timestamp ${this.timestamp}, genesis ${hr.header!.timestamp}`);
            return {err: ErrorCode.RESULT_OK};
        }
        // 不能偏离太远
        let src = Math.trunc(offset / chain.globalOptions.blockInterval);
        let min = Math.trunc((offset - chain.globalOptions.maxBlockIntervalOffset) / chain.globalOptions.blockInterval);
        let max = Math.trunc((offset + chain.globalOptions.maxBlockIntervalOffset) / chain.globalOptions.blockInterval);
        if (src === min && src === max) {
            return {err: ErrorCode.RESULT_OK, index: src};
        } else if (src !== min) {
            return {err: ErrorCode.RESULT_OK, index: src};
        } else if (src !== max) {
            return {err: ErrorCode.RESULT_OK, index: max};
        } else {
            assert(false);
            return {err: ErrorCode.RESULT_OK};
        }
    }

    private async _verifyMiner(chain: Chain): Promise<{ err: ErrorCode, valid?: boolean }> {
        if (!this.number) {
            return {err: ErrorCode.RESULT_EXCEPTION};
        }

        let hr = await chain.getHeader(this.preBlockHash);
        if (hr.err) {
            return {err: hr.err};
        }
        // 时间不可回退
        let preHeader = hr.header! as DposBlockHeader;
        if (this.timestamp < preHeader.timestamp) {
            return {err: ErrorCode.RESULT_OK, valid: false};
        }
        
        let dmr = await this.getDueMiner(chain);
        if (dmr.err) {
            return {err: dmr.err};
        }

        return {err: ErrorCode.RESULT_OK, valid: dmr.miner === this.miner};
    }

    public async getDueMiner(chain: Chain): Promise<{err: ErrorCode, miner?: string}> {
        if (!this.number) {
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
        let tir = await this.getTimeIndex(chain);
        if (tir.err) {
            chain.logger.error(`getTimeIndex failed, err ${tir.err}`);
            return {err: tir.err};
        }
        if (!tir.index) {
            chain.logger.error(`getTimeIndex failed, no tir.index`);
            return {err: ErrorCode.RESULT_OK};
        }
        
        let thisIndex = tir.index;
        let gcr = await (chain as DposChain).getMiners(this);
        if (gcr.err) {
            chain.logger.error(`getMiners failed, err ${gcr.err}`);
            return {err: gcr.err};
        }
        let electionHeader = gcr.header!;
        tir = await electionHeader.getTimeIndex(chain);
        let electionIndex = tir.index!;
        let index = (thisIndex - electionIndex) % gcr.creators!.length;
        if (index < 0) {
            chain.logger.error(`calcute index failed, thisIndex ${thisIndex}, electionIndex ${electionIndex}, creators length ${gcr.creators!.length}`);
            return {err: ErrorCode.RESULT_OK};
        }
        let creators = gcr.creators!;
        return {err: ErrorCode.RESULT_OK, miner: creators[index]};
    }
}