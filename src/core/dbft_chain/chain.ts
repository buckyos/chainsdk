import {ErrorCode} from '../error_code';
import {isNullOrUndefined} from 'util';
import {Chain, ChainTypeOptions, ValueChain, BaseHandler, Block, ValueTransactionContext, ValueEventContext, ValueViewContext, IReadableKeyValue, IReadableStorage, Storage, BlockExecutor, BlockHeader, ViewExecutor, ChainContructOptions} from '../value_chain';
import {DbftBlockHeader} from './block';
import {DbftContext} from './context';
import {DbftBlockExecutor} from './executor';
import * as ValueContext from '../value_chain/context';
import {DbftHeaderStorage} from './header_storage'; 

export type DbftTransactionContext = {
    register: (caller: string, address: string) => Promise<ErrorCode>;
    unregister: (caller: string, address: string) => Promise<ErrorCode>;
} & ValueTransactionContext;

export type DbftEventContext = {
    register: (caller: string, address: string) => Promise<ErrorCode>;
    unregister: (caller: string, address: string) => Promise<ErrorCode>;
} & ValueEventContext;

export type DbftViewContext = {
    getMiners: () => Promise<{address: string, pubkey: string}[]>;
    isMiner: (address: string) => Promise<boolean>;
} & ValueViewContext;

export class DbftChain extends ValueChain {
    protected m_dbftHeaderStorage?: DbftHeaderStorage;
    
    constructor(options: ChainContructOptions) {
        super(options);
    }

    // 都不需要验证内容
    protected get _ignoreVerify(): boolean {
        return true;
    }

    // 不会分叉
    protected get _morkSnapshot(): boolean {
        return false;
    }

    public async newBlockExecutor(block: Block, storage: Storage): Promise<{err: ErrorCode, executor?: BlockExecutor}> {
        let kvBalance = (await storage.getKeyValue(Chain.dbSystem, ValueChain.kvBalance)).kv!;

        let ve = new ValueContext.Context(kvBalance);
        let externalContext = Object.create(null);
        externalContext.getBalance = async (address: string): Promise<BigNumber> => {
            return await ve.getBalance(address);
        };
        externalContext.transferTo = async (address: string, amount: BigNumber): Promise<ErrorCode> => {
            return await ve.transferTo(ValueChain.sysAddress, address, amount);
        };
        
        let context = new DbftContext(storage, this.globalOptions, this.logger);
        externalContext.register = async (caller: string, address: string): Promise<ErrorCode> => {
           return await context.registerToCandidate(caller, block.number, address);
        };
        externalContext.unregister = async (caller: string, address: string): Promise<ErrorCode> => {
            return await context.unRegisterFromCandidate(caller, address);
        };

        externalContext.getMiners = async (): Promise<string[]> => {
            let gm = await context.getMiners();
            if (gm.err) {
               throw Error('newBlockExecutor getMiners failed errcode ${gm.err}');
            }
            return gm.miners!;
        };

        externalContext.isMiner = async (address: string): Promise<boolean> => {
            let im = await context.isMiner(address);
            if (im.err) {
                throw Error('newBlockExecutor isMiner failed errcode ${gm.err}');
            }

            return im.isminer!;
        };

        let executor = new DbftBlockExecutor({logger: this.logger, block, storage, handler: this.m_handler, externContext: externalContext, globalOptions: this.m_globalOptions});
        return {err: ErrorCode.RESULT_OK, executor: executor as BlockExecutor};
    }

    public async newViewExecutor(header: BlockHeader, storage: IReadableStorage, method: string, param: Buffer|string|number|undefined): Promise<{err: ErrorCode, executor?: ViewExecutor}> {
        let nvex = await super.newViewExecutor(header, storage, method, param);
        let externalContext = nvex.executor!.externContext;

        let dbftProxy = new DbftContext(storage, this.m_globalOptions, this.logger);
        externalContext.getMiners = async (): Promise<string[]> => {
            let gm = await dbftProxy.getMiners();
            if (gm.err) {
               throw Error('newBlockExecutor getMiners failed errcode ${gm.err}');
            }

            return gm.miners!;
        };

        externalContext.isMiner = async (address: string): Promise<boolean> => {
            let im = await dbftProxy.isMiner(address);
            if (im.err) {
                throw Error('newBlockExecutor isMiner failed errcode ${gm.err}');
            }

            return im.isminer!;
        };

        return nvex;
    }

    public async initComponents(options?: {readonly?: boolean}) {
        let err = await super.initComponents(options);
        if (err) {
            return err;
        }
        this.m_dbftHeaderStorage = new DbftHeaderStorage({
            db: this.m_db!,
            headerStorage: this.m_headerStorage!,
            globalOptions: this.globalOptions,
            logger: this.logger!,
            readonly: this.m_readonly
        });
        err = await this.m_dbftHeaderStorage.init();
        if (err) {
            this.logger.error(`dbft header storage init err `, err);
        }
        return err;
    }

    public async uninitComponents() {
        if (this.m_dbftHeaderStorage) {
            this.m_dbftHeaderStorage.uninit();
            delete this.m_dbftHeaderStorage;
        }

        await super.uninitComponents();
    }

    protected _getBlockHeaderType() {
        return DbftBlockHeader;
    }

    protected async _onVerifiedBlock(block: Block): Promise<ErrorCode> {
        return await this.m_dbftHeaderStorage!.addHeader(block.header as DbftBlockHeader, this.m_storageManager!);
    }

    protected _onCheckGlobalOptions(globalOptions: any): boolean {
        if (!super._onCheckGlobalOptions(globalOptions)) {
            return false;
        }
        if (isNullOrUndefined(globalOptions.minValidator)) {
            this.m_logger.error(`globalOptions should has minValidator`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.maxValidator)) {
            this.m_logger.error(`globalOptions should has maxValidator`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.reSelectionBlocks)) {
            this.m_logger.error(`globalOptions should has reSelectionBlocks`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.blockInterval)) {
            this.m_logger.error(`globalOptions should has blockInterval`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.minWaitBlocksToMiner)) {
            this.m_logger.error(`globalOptions should has minWaitBlocksToMiner`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.superAdmin)) {
            this.m_logger.error(`globalOptions should has superAdmin`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.agreeRateNumerator)) {
            this.m_logger.error(`globalOptions should has agreeRateNumerator`);
            return false;
        }
        if (isNullOrUndefined(globalOptions.agreeRateDenominator)) {
            this.m_logger.error(`globalOptions should has agreeRateDenominator`);
            return false;
        }
        return true;
    }

    protected _onCheckTypeOptions(typeOptions: ChainTypeOptions): boolean {
        return typeOptions.consensus === 'dbft';
    }

    get dbftHeaderStorage() {
        return this.m_dbftHeaderStorage!;
    }

    protected async _calcuteReqLimit(fromHeader: string, limit: number) {
        let hr = await this.getHeader(fromHeader);
        let reSelectionBlocks = this.globalOptions!.reSelectionBlocks;
        return reSelectionBlocks - (hr.header!.number % reSelectionBlocks);
    }
    
    async onCreateGenesisBlock(block: Block, storage: Storage, genesisOptions: any): Promise<ErrorCode> {
        let err = await super.onCreateGenesisBlock(block, storage, genesisOptions);
        if (err) {
            return err;
        }

        let gkvr = await storage.getKeyValue(Chain.dbSystem, Chain.kvConfig);
        if (gkvr.err) {
            return gkvr.err;
        }
        let rpr = await gkvr.kv!.set('consensus', 'dbft');
        if (rpr.err) {
            return rpr.err;
        }

        let dbr = await storage.getReadWritableDatabase(Chain.dbSystem);
        if (dbr.err) {
            return dbr.err;
        }
        // storage的键值对要在初始化的时候就建立好
        let kvr = await dbr.value!.createKeyValue(DbftContext.kvDBFT);
        if (kvr.err) {
            return kvr.err;
        }
        let denv = new DbftContext(storage, this.globalOptions, this.m_logger);

        let ir = await denv.init(genesisOptions.miners);
        if (ir.err) {
            return ir.err;
        }
        return ErrorCode.RESULT_OK;
    }
}