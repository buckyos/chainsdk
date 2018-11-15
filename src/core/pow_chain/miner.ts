import * as path from 'path';
import * as assert from 'assert';

import { ErrorCode } from '../error_code';
import {Workpool} from '../lib/workpool';
import { BufferWriter } from '../lib/writer';

import { Block, ValueMiner,  Chain, BlockHeader, Storage, MinerState, ValueMinerInstanceOptions, ChainContructOptions } from '../value_chain';

import { PowBlockHeader } from './block';
import * as consensus from './consensus';
import { PowChain } from './chain';
import { LoggerOptions } from '../lib/logger_util';

export type PowMinerInstanceOptions = {coinbase?: string} & ValueMinerInstanceOptions;

export class PowMiner extends ValueMiner {
    private workpool: Workpool;

    constructor(options: ChainContructOptions) {
        super(options);
        const filename = path.resolve(__dirname, '../../routine/pow_worker.js');
        this.workpool = new Workpool(filename, 1);
    }

    protected _chainInstance(): Chain {
        return new PowChain(this.m_constructOptions);
    }

    get chain(): PowChain {
        return this.m_chain as PowChain;
    }

    private _newHeader(): PowBlockHeader {
        let tip = this.m_chain!.tipBlockHeader! as PowBlockHeader;
        let blockHeader = new PowBlockHeader();
        blockHeader.setPreBlock(tip);
        blockHeader.timestamp = Date.now() / 1000;
        return blockHeader;
    }

    public async initialize(options: PowMinerInstanceOptions): Promise<ErrorCode> {
        if (options.coinbase) {
            this.m_coinbase = options.coinbase;
        }
        let err = await super.initialize(options);
        if (err) {
            return err;
        }
        this._createBlock(this._newHeader());
        return ErrorCode.RESULT_OK;
    }

    protected async _mineBlock(block: Block): Promise<ErrorCode> {
        // 这里计算bits
        this.m_logger.info(`begin mine Block (${block.number})`);
        let tr = await consensus.getTarget(block.header as PowBlockHeader, this.m_chain!);
        if (tr.err) {
            return tr.err;
        }
        assert(tr.target !== undefined);
        if (tr.target! === 0) {
            // console.error(`cannot get target bits for block ${block.number}`);
            return ErrorCode.RESULT_INVALID_BLOCK;
        }
        (block.header as PowBlockHeader).bits = tr.target!;
        // 使用一个workerpool来计算正确的nonce
        let ret = await this._calcuteBlockHashWorkpool((block.header as PowBlockHeader), {start: 0, end: consensus.INT32_MAX}, {start: 0, end: consensus.INT32_MAX});
        if (ret === ErrorCode.RESULT_OK) {
            block.header.updateHash();
            this.m_logger.info(`mined Block (${block.number}) target ${(block.header as PowBlockHeader).bits} : ${block.header.hash}`);
        }
        
        return ret;
    }

    /**
     * virtual 
     * @param chain 
     * @param tipBlock 
     */

    protected async _onTipBlock(chain: Chain, tipBlock: BlockHeader): Promise<void> {
        this.m_logger.info(`onTipBlock ${tipBlock.number} : ${tipBlock.hash}`);
        this._createBlock(this._newHeader());
    }

    protected _onCancel(state: MinerState, context?: {name: string} & any) {
        super._onCancel(state, context);
        if (state === MinerState.mining) {
            this.m_logger.info(`cancel mining`);
            this.workpool.stop();
        } 
    }

    private async _calcuteBlockHashWorkpool(blockHeader: PowBlockHeader, nonceRange: { start: number, end: number }, nonce1Range: { start: number, end: number }): Promise<ErrorCode> {
        return new Promise<ErrorCode>((reslove, reject) => {
            let writer = new BufferWriter();
            let err = blockHeader.encode(writer);
            if (err) {
                this.m_logger.error(`header encode failed `, blockHeader);
                reslove(err);
                return ;
            }
            let buffer = writer.render();
            this.workpool.push({data: buffer, nonce: nonceRange, nonce1: nonce1Range}, 
                (code, signal, ret) => {
                    if (code === 0) {
                        let result = JSON.parse(ret);
                        blockHeader.nonce = result['nonce'];
                        blockHeader.nonce1 = result['nonce1'];
                        assert(blockHeader.verifyPOW());
                        reslove(ErrorCode.RESULT_OK);
                    } else if (signal === 'SIGTERM') {
                        reslove(ErrorCode.RESULT_CANCELED);
                    } else {
                        this.m_logger.error(`worker error! code: ${code}, ret: ${ret}`);
                        reslove(ErrorCode.RESULT_FAILED);
                    }
                });
        });
    }
}