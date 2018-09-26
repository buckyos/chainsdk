import * as assert from 'assert';

import { ErrorCode } from '../error_code';
import { addressFromSecretKey } from '../address';

import {ValueMiner, Chain, Block, Storage, ValueMinerInstanceOptions, INode} from '../value_chain';
import { DposBlockHeader } from './block';
import {DposChain} from './chain';
import * as consensus from './consensus';
import { LoggerOptions } from '../lib/logger_util';

export type DposMinerInstanceOptions = {secret: Buffer} & ValueMinerInstanceOptions;

export class DposMiner extends ValueMiner {
    private m_secret?: Buffer;
    private m_address?: string;
    private m_timer?: NodeJS.Timer;

    get chain(): DposChain {
        return this.m_chain as DposChain;
    }

    get address(): string {
        return this.m_address!;
    }

    protected _chainInstance(): Chain {
        return new DposChain(this.m_constructOptions);
    }

    public parseInstanceOptions(node: INode, instanceOptions: Map<string, any>): {err: ErrorCode, value?: any} {
        let {err, value} = super.parseInstanceOptions(node, instanceOptions);
        if (err) {
            return {err};
        }
        if (!instanceOptions.get('minerSecret')) {
            this.m_logger.error(`invalid instance options not minerSecret`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        value.secret = Buffer.from(instanceOptions.get('minerSecret'), 'hex');
        return {err: ErrorCode.RESULT_OK, value};
    }
    
    public async initialize(options: DposMinerInstanceOptions): Promise<ErrorCode> {
        this.m_secret = options.secret;
        this.m_address = addressFromSecretKey(this.m_secret);
        if (!this.m_address) {
            this.m_logger.error(`dpos miner init failed for invalid secret`);
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        if (!options.coinbase) {
            this.coinbase = this.m_address;
        }
        assert(this.coinbase, `secret key failed`);

        if (!this.m_address) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        let err = await super.initialize(options);
        if (err) {
            return err;
        }
        this.m_logger.info(`begin Mine...`);
        this._resetTimer();

        return ErrorCode.RESULT_OK;
    }

    protected async _resetTimer(): Promise<ErrorCode> {
        let tr = await this._nextBlockTimeout();
        if (tr.err) {
            return tr.err;
        }

        if (this.m_timer) {
            clearTimeout(this.m_timer);
            delete this.m_timer; 
        }
        
        this.m_timer = setTimeout(async () => {
            delete this.m_timer;
            let now = Date.now() / 1000;
            let tip = this.m_chain!.tipBlockHeader! as DposBlockHeader;
            let blockHeader = new DposBlockHeader();
            blockHeader.setPreBlock(tip);
            blockHeader.timestamp = now;
            let dmr = await blockHeader.getDueMiner(this.m_chain as Chain);
            if (dmr.err) {
                return ;
            }
            this.m_logger.info(`calcuted block ${blockHeader.number} creator: ${dmr.miner}`);
            if (!dmr.miner) {
                assert(false, 'calcuted undefined block creator!!');
                process.exit(1);
            }
            if (this.m_address === dmr.miner) {
                await this._createBlock(blockHeader);
            }
            this._resetTimer();
        }, tr.timeout!);
        return ErrorCode.RESULT_OK;
    }
    
    protected async _mineBlock(block: Block): Promise<ErrorCode> {
        // 只需要给block签名
        this.m_logger.info(`${this.peerid} create block, sign ${this.m_address}`);
        (block.header as DposBlockHeader).signBlock(this.m_secret!);
        block.header.updateHash();
        return ErrorCode.RESULT_OK;
    }

    protected async _nextBlockTimeout(): Promise<{err: ErrorCode, timeout?: number}> {
        let hr = await this.m_chain!.getHeader(0);
        if (hr.err) {
            return {err: hr.err};
        }
        let now = Date.now() / 1000;
        let blockInterval = this.m_chain!.globalOptions.blockInterval;
        let nextTime = (Math.floor((now - hr.header!.timestamp) / blockInterval) + 1) * blockInterval;

        return {err: ErrorCode.RESULT_OK, timeout: (nextTime + hr.header!.timestamp - now) * 1000};
    }
}