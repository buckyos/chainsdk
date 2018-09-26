import {ErrorCode} from '../error_code';
import {Miner, Block, Storage, Chain, MinerInstanceOptions, INode, ChainContructOptions} from '../chain';
import {ValueBlockHeader} from './block';
import {BigNumber} from 'bignumber.js';
import {ValueChain} from './chain';
import { LoggerOptions } from '../lib/logger_util';
const assert = require('assert');

export type ValueMinerInstanceOptions = {coinbase?: string} & MinerInstanceOptions;

export class ValueMiner extends Miner {
    constructor(options: ChainContructOptions) {
        super(options);
    }

    set coinbase(address: string|undefined) {
        this.m_coinbase = address;
    }

    get coinbase(): string|undefined {
        return this.m_coinbase;
    }

    protected m_coinbase?: string;

    protected _chainInstance(): Chain {
        return new ValueChain(this.m_constructOptions);
    }

    get chain(): ValueChain {
        return this.m_chain as ValueChain;
    }

    public parseInstanceOptions(node: INode, instanceOptions: Map<string, any>): {err: ErrorCode, value?: any} {
        let {err, value} = super.parseInstanceOptions(node, instanceOptions);
        if (err) {
            return {err};
        }
        value.coinbase = instanceOptions.get('coinbase');
        return {err: ErrorCode.RESULT_OK, value};
    }

    public async initialize(options: ValueMinerInstanceOptions): Promise<ErrorCode> {
        if (options.coinbase) {
            this.m_coinbase = options.coinbase;
        }
        return super.initialize(options);
    }

    protected async _decorateBlock(block: Block) {
        (block.header as ValueBlockHeader).coinbase = this.m_coinbase!;
        return ErrorCode.RESULT_OK;
    }
}