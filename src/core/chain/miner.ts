import {Chain, ChainGlobalOptions, ChainInstanceOptions, ChainContructOptions} from './chain';
import {Block, BlockHeader, NetworkCreator} from '../block';
import {ErrorCode} from '../error_code';
import * as assert from 'assert';
import {LoggerInstance, LoggerOptions} from '../lib/logger_util';
import { EventEmitter } from 'events';
import { INode } from '../net';
import { BlockExecutorRoutine } from './executor_routine';
import { runInNewContext } from 'vm';

export type MinerInstanceOptions = ChainInstanceOptions;

export enum MinerState {
    none = 0,
    init = 1,
    syncing = 2,
    idle = 3,
    executing = 4,
    mining = 5,
}

export class Miner extends EventEmitter {
    protected m_chain?: Chain;
    protected m_instanceOptions: any;
    protected m_constructOptions: any;
    protected m_state: MinerState;
    protected m_stateContext?: {name: string} & any;
    protected m_logger!: LoggerInstance;
    protected m_onTipBlockListener?: any;
    constructor(options: ChainContructOptions) {
        super();
        this.m_constructOptions = options;
        this.m_logger = options.logger!;
        this.m_state = MinerState.none;
        
    }

    get chain(): Chain {
        return this.m_chain!;
    }

    public async initComponents(): Promise<ErrorCode> {
         // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state > MinerState.none) {
            return ErrorCode.RESULT_OK;
        }
        
        this.m_chain = this._chainInstance();
        let err = await this.m_chain!.initComponents();
        if (err) {
            this.m_logger.error(`miner initComponent failed for chain initComponent failed`, err);
            return err;
        }
        this.m_state = MinerState.init;
        return ErrorCode.RESULT_OK;
    }

    public async uninitComponents(): Promise<void> {
         // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== MinerState.init) {
            return ;
        }
        await this.m_chain!.uninitComponents();
        delete this.m_chain;

        this.m_state = MinerState.none;
    }

    protected _chainInstance(): Chain {
        return new Chain(this.m_constructOptions);
    }

    public parseInstanceOptions(options: {
        parsed: any, 
        origin: Map<string, any>
    }): {err: ErrorCode, value?: any} {
        const chainRet = this.m_chain!.parseInstanceOptions(options);
        if (chainRet.err) {
            return chainRet;
        }
        let value = chainRet.value!;
        if (options.origin.has('genesisMiner')) {
            value.minOutbound = 0;
        }
        return {err: ErrorCode.RESULT_OK, value};
    }

    public async initialize(options: MinerInstanceOptions): Promise<ErrorCode> {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state !== MinerState.init) {
            this.m_logger.error(`miner initialize failed hasn't initComponent`);
            return ErrorCode.RESULT_INVALID_STATE;
        }
        this.m_state = MinerState.syncing;
        let err = await this.m_chain!.initialize(options);
        if (err) {
            this.m_logger.error(`miner initialize failed for chain initialize failed ${err}`);
            return err;
        }
        this.m_onTipBlockListener = this._onTipBlock.bind(this);
        this.m_chain!.on('tipBlock', this.m_onTipBlockListener);
        this.m_state = MinerState.idle;
        return ErrorCode.RESULT_OK;
    }

    async uninitialize(): Promise<any> {
        // 上层保证await调用别重入了, 不加入中间状态了
        if (this.m_state <= MinerState.init) {
            return ;
        }
        this.m_chain!.removeListener('tipBlock', this.m_onTipBlockListener);
        delete this.m_onTipBlockListener;
        await this.m_chain!.uninitialize();
        this.m_state = MinerState.init;
    }

    public async create(genesisOptions?: any): Promise<ErrorCode> {
        if (this.m_state !== MinerState.init) {
            this.m_logger.error(`miner create failed hasn't initComponent`);
            return ErrorCode.RESULT_INVALID_STATE;
        }
        let genesis = this.m_chain!.newBlock();
        genesis.header.timestamp = Date.now() / 1000;
        let sr = await this.chain.storageManager.createStorage('genesis');
        if (sr.err) {
            return sr.err;
        }
        let err = ErrorCode.RESULT_OK;
        do {
            err = await this._decorateBlock(genesis);
            if (err) {
                break;
            }
            err = await this.chain.onCreateGenesisBlock(genesis, sr.storage!, genesisOptions);
            if (err) {
                break;
            }
            let nber = await this.chain.newBlockExecutor(genesis, sr.storage!);
            if (nber.err) {
                err = nber.err;
                break;
            }
            err = await nber.executor!.execute();
            if (err) {
                break;
            }
            let ssr = await this.chain.storageManager.createSnapshot(sr.storage!, genesis.header.hash);
            if (ssr.err) {
                err = ssr.err;
                break;
            }
            assert(ssr.snapshot);
            err = await this.chain.onPostCreateGenesis(genesis, ssr.snapshot!);
        } while (false);
        await sr.storage!.remove();
        return err;
    }

    protected _setIdle(name: string) {
        if (this._checkCancel(name)) {
            return;
        }
        this.m_state = MinerState.idle;
        delete this.m_stateContext; 
    }

    protected _checkCancel(name: string) {
        if (this.m_state <= MinerState.idle) {
            return true;
        }
        if (this.m_state > MinerState.idle) {
            if (this.m_stateContext!.name !== name) {
                return true;
            } 
        } 
        return false;
    }

    protected _onCancel(state: MinerState, context?: {name: string} & any) {
        if (state === MinerState.executing) {
            if (context && context.routine) {
                context.routine.cancel();
            }
        } 
    }

    protected async _createExecuteRoutine(block: Block): Promise<{err: ErrorCode, routine?: BlockExecutorRoutine, next?: () => Promise<{err: ErrorCode, block?: Block}>}> {
        let name: string = `${Date.now()}${block.header.preBlockHash}`;
        if (this.m_state !== MinerState.idle) {
            if (this.m_state > MinerState.idle) {
                if (this.m_stateContext!.name === name) {
                    return {err: ErrorCode.RESULT_INVALID_STATE};
                } else {
                    let state = this.m_state;
                    let context = this.m_stateContext;
                    this.m_state = MinerState.idle;
                    delete this.m_stateContext; 
                    this._onCancel(state, context);
                }
            } else {
                return {err: ErrorCode.RESULT_INVALID_STATE};
            }
        }

        this.m_state = MinerState.executing;
        this.m_stateContext = Object.create(null);
        this.m_stateContext.name = name;
        let sr = await this.chain.storageManager.createStorage(name, block.header.preBlockHash);
        if (sr.err) {
            this._setIdle(name);
            return {err: sr.err};
        }
        sr.storage!.createLogger();
        const crr = this.chain.routineManager.create({name, block, storage: sr.storage!});
        if (crr.err) {
            this._setIdle(name);
            await sr.storage!.remove();
            return {err: crr.err};
        }
        const routine = crr.routine!;
        this.m_stateContext.routine = crr.routine!;
        const next = async (): Promise<{err: ErrorCode, block?: Block}> => {
            let err: ErrorCode;
            do {
                const rer = await routine.execute();
                err = rer.err;
                if (err) {
                    this.m_logger.error(`${routine.name} block execute failed! ret ${err}`);
                    break;
                }
                err = rer.result!.err;
                if (err) {
                    this.m_logger.error(`${routine.name} block execute failed! ret ${err}`);
                    break;
                }
                if (this._checkCancel(routine.name)) {
                    err = ErrorCode.RESULT_CANCELED;
                    this.m_logger.error(`${routine.name} block execute canceled! ret ${err}`);
                    break;
                }
                this.m_state = MinerState.mining;
                delete this.m_stateContext.routine;
                err = await this._mineBlock(routine.block);
                if (err) {
                    this.m_logger.error(`mine block failed! ret ${err}`);
                    break;
                }
                if (this._checkCancel(routine.name)) {
                    err = ErrorCode.RESULT_CANCELED;
                    this.m_logger.error(`${name} block execute canceled! ret ${err}`);
                    break;
                }
            } while (false);
            this._setIdle(routine.name);
            if (err) {
                await routine.storage!.remove();
                return {err};
            }
            let ssr = await this.chain.storageManager.createSnapshot(routine.storage, routine.block.hash, true);
            if (ssr.err) {
                return {err: ssr.err};
            }
            await this.chain.addMinedBlock(routine.block, ssr.snapshot!);
            this.m_logger.info(`finish mine a block on block hash: ${this.chain.tipBlockHeader!.hash} number: ${this.chain.tipBlockHeader!.number}`);
            return {err: ErrorCode.RESULT_OK, block: routine.block};
        };
        return {err: ErrorCode.RESULT_OK, routine, next};
    }

    protected async _createBlock(header: BlockHeader): Promise<{err: ErrorCode, block?: Block}> {
        let block = this.chain.newBlock(header);
        this.pushTx(block);
        await this._decorateBlock(block);
        const cer = await this._createExecuteRoutine(block);
        if (cer.err) {
            return {err: cer.err};
        }
        return cer.next!();
    }

    protected pushTx(block: Block) {
        let tx = this.chain.pending.popTransaction();
        while (tx) {
            block.content.addTransaction(tx);
            tx = this.chain.pending.popTransaction();
        }
    }

    /**
     * virtual 
     * @param chain 
     * @param tipBlock 
     */
    protected async _onTipBlock(chain: Chain, tipBlock: BlockHeader): Promise<void> {
    }

    /**
     * virtual
     * @param block 
     */
    protected async _mineBlock(block: Block): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    } 

    protected async _decorateBlock(block: Block): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }
}
