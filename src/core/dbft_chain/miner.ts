const assert = require('assert');
import { ErrorCode, stringifyErrorCode } from '../error_code';
import { LoggerOptions } from '../lib/logger_util';
import { addressFromSecretKey } from '../address';
import { Chain, ValueMinerInstanceOptions, ValueMiner, Block, NetworkCreator, ChainContructOptions, BlockExecutorRoutine } from '../value_chain';

import { DbftBlockHeader, DbftBlockHeaderSignature } from './block';
import { DbftChain } from './chain';
import { ValidatorsNetwork } from './validators_network';
import { DbftConsensusNode } from './consensus_node';

class DbftMinerChain extends DbftChain {
    protected _defaultNetworkOptions() {
        return {
            netType: 'validators', 
            initialValidator: this.globalOptions.superAdmin,
            minConnectionRate: this.globalOptions.agreeRateNumerator / this.globalOptions.agreeRateDenominator,
        };
    }

    get headerStorage() {
        return this.m_headerStorage!;
    }

    protected async _calcuteReqLimit(fromHeader: string, limit: number) {
        let hr = await this.getHeader(fromHeader);
        let reSelectionBlocks = this.globalOptions!.reSelectionBlocks;
        return reSelectionBlocks - (hr.header!.number % reSelectionBlocks);
    }
}

export type DbftMinerInstanceOptions = { minerSecret: Buffer } & ValueMinerInstanceOptions;

export class DbftMiner extends ValueMiner {
    private m_secret?: Buffer;
    private m_address?: string;
    private m_consensusNode?: DbftConsensusNode;
    private m_miningBlocks: Map<string, (err: ErrorCode) => void> = new Map();
    private m_verifying?: {name: string, routine?: BlockExecutorRoutine};

    get chain(): DbftMinerChain {
        return this.m_chain as DbftMinerChain;
    }

    get address(): string {
        return this.m_address!;
    }

    protected _chainInstance(): Chain {
        return new DbftMinerChain(this.m_constructOptions);
    }
    
    constructor(options: ChainContructOptions) {
        super(options);
    }

    parseInstanceOptions(options: {
        parsed: any, 
        origin: Map<string, any>
    }): {err: ErrorCode, value?: any} {
        let {err, value} = super.parseInstanceOptions(options);
        if (err) {
            return {err};
        }
        if (!options.origin.get('minerSecret')) {
            this.m_logger.error(`invalid instance options not minerSecret`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        value.minerSecret = Buffer.from(options.origin.get('minerSecret'), 'hex');
        return {err: ErrorCode.RESULT_OK, value};
    }

    protected async _createBlock(header: DbftBlockHeader): Promise<{err: ErrorCode, block?: Block}> {
        const block = this.chain.newBlock(header);
        this.pushTx(block);
        await this._decorateBlock(block);
        const cer = await this._createExecuteRoutine(block);
        if (cer.err) {
            return {err: cer.err};
        }
        // first broadcast，then execute
        const err = await this.m_consensusNode!.newProposal(cer.routine!.block!);
        if (err) {
            this._setIdle(cer.routine!.name);
            return {err};
        }
        return cer.next!();
    }

    public async initialize(options: DbftMinerInstanceOptions): Promise<ErrorCode> {
        this.m_secret = options.minerSecret;
        this.m_address = addressFromSecretKey(this.m_secret);
        if (!options.coinbase) {
            this.coinbase = this.m_address;
        }

        let err = await super.initialize(options);
        if (err) {
            this.m_logger.error(`dbft miner super initialize failed, errcode ${err}`);
            return err;
        }  
        
        this.m_consensusNode = new DbftConsensusNode({
            network: this.m_chain!.node.getNetwork() as ValidatorsNetwork,
            globalOptions: this.m_chain!.globalOptions,
            secret: this.m_secret!
        });
        err = await this.m_consensusNode.init();
        if (err) {
            this.m_logger.error(`dbft miner consensus node init failed, errcode ${err}`);
            return err;
        }
        let tip = this.chain.tipBlockHeader! as DbftBlockHeader;
        err = await this._updateTip(tip);
        if (err) {
            this.m_logger.error(`dbft miner initialize failed, errcode ${err}`);
            return err;
        } 
        this.m_consensusNode.on('createBlock', async (header: DbftBlockHeader) => {
            if (header.preBlockHash !== this.chain.tipBlockHeader!.hash) {
                this.m_logger.warn(`mine block skipped`);
                return ;
            }
            this.m_logger.info(`begin create block ${header.hash} ${header.number} ${header.view}`);
            let cbr = await this._createBlock(header);
            if (cbr.err) {
                this.m_logger.error(`create block failed `, cbr.err);
            } else {
                this.m_logger.info(`create block finsihed `);
            }
        });
        this.m_consensusNode.on('verifyBlock', async (block: Block) => {
            this.m_logger.info(`begin verify block ${block.hash} ${block.number}`);
            const cer = await this._createExecuteRoutine(block);
            if (cer.err) {
                this.m_logger.error(`dbft verify block failed `, cer.err);
                return;
            }
            const nr = await cer.next!();
            if (nr.err) {
                this.m_logger.error(`dbft verify block failed `, nr.err);
                return ;
            }
        });
        this.m_consensusNode.on('mineBlock', async (block: Block, signs: DbftBlockHeaderSignature[]) => {
            (block.header as DbftBlockHeader).setSigns(signs);
            assert(this.m_miningBlocks.has(block.hash));
            const resolve = this.m_miningBlocks.get(block.hash)!;
            resolve(ErrorCode.RESULT_OK);
        });
        return err;
    }

    protected async _updateTip(tip: DbftBlockHeader): Promise<ErrorCode> {
        let gnmr = await this.chain.dbftHeaderStorage.getNextMiners(tip);
        if (gnmr.err) {
            this.m_logger.error(`dbft miner initialize failed for `, gnmr.err);
            return gnmr.err;
        }
        let gtvr = await this.chain.dbftHeaderStorage.getTotalView(tip);
        if (gtvr.err) {
            this.m_logger.error(`dbft miner initialize failed for `, gtvr.err);
            return gnmr.err;
        }
        this.m_consensusNode!.updateTip(tip, gnmr.miners!, gtvr.totalView!);
        return ErrorCode.RESULT_OK;
    }

    protected async _onTipBlock(chain: DbftChain, tipBlock: DbftBlockHeader): Promise<void> {
        await this._updateTip(tipBlock);
    }

    protected async _mineBlock(block: Block): Promise<ErrorCode> {
        this.m_logger.info(`create block, sign ${this.m_address}`);
        block.header.updateHash();
        return new Promise<ErrorCode>((resolve) => {
            if (this.m_miningBlocks.has(block.hash)) {
                resolve(ErrorCode.RESULT_SKIPPED);
                return ;
            }
            this.m_miningBlocks.set(block.hash, resolve);
            this.m_consensusNode!.agreeProposal(block);
        });
    }
}
