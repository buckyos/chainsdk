import {ErrorCode, stringifyErrorCode} from './error_code';
import {BigNumber} from 'bignumber.js';
import {ChainCreator} from './chain_creator';
import {JsonStorage} from './storage_json/storage';
import { LoggerInstance } from './lib/logger_util';
import {Chain, Block, Transaction, BlockHeader, Receipt, BlockHeightListener} from './chain';
import {ValueTransaction, ValueBlockHeader, ValueBlockExecutor, ValueReceipt} from './value_chain';
import {createKeyPair, addressFromSecretKey} from './address';
import {StorageDumpSnapshotManager, StorageManager, StorageLogSnapshotManager} from './storage';
import { isArray } from 'util';
import { SqliteStorage } from './storage_sqlite/storage';

export class ValueChainDebugSession {
    constructor(private readonly debuger: ValueMemoryDebuger) {
        
    }
    private m_dumpSnapshotManager?: StorageDumpSnapshotManager;
    private m_storageManager?: StorageManager;
    async init(storageDir: string): Promise<ErrorCode> {
        const chain = this.debuger.chain;
        const dumpSnapshotManager = new StorageDumpSnapshotManager({
            logger: chain.logger,
            path: storageDir
        });
        this.m_dumpSnapshotManager = dumpSnapshotManager;
        const snapshotManager = new StorageLogSnapshotManager({
            path: chain.storageManager.path,
            headerStorage: chain.headerStorage, 
            storageType: JsonStorage,
            logger: chain.logger,
            dumpSnapshotManager
        });
        const storageManager = new StorageManager({
            path: storageDir,
            storageType: JsonStorage,
            logger: chain.logger,
            snapshotManager
        });
        this.m_storageManager = storageManager;
        let err = await this.m_storageManager.init();
        if (err) {
            chain.logger.error(`ValueChainDebugSession init storageManager init failed `, stringifyErrorCode(err));
            return err;
        }
        const ghr = await chain.headerStorage.getHeader(0);
        if (ghr.err) {
            chain.logger.error(`ValueChainDebugSession init get genesis header failed `, stringifyErrorCode(ghr.err));
            return ghr.err;
        }

        const genesisHash = ghr.header!.hash;
        const gsr = await this.m_dumpSnapshotManager.getSnapshot(genesisHash);
        if (!gsr.err) {
            return ErrorCode.RESULT_OK;
        } else if (gsr.err !== ErrorCode.RESULT_NOT_FOUND) {
            chain.logger.error(`ValueChainDebugSession init get gensis dump snapshot err `, stringifyErrorCode(gsr.err));
            return gsr.err;
        }

        const gsvr = await chain.storageManager.getSnapshotView(genesisHash);
        if (gsvr.err) {
            chain.logger.error(`ValueChainDebugSession init get gensis dump snapshot err `, stringifyErrorCode(gsvr.err));
            return gsvr.err;
        }
        const srcStorage = gsvr.storage as SqliteStorage;
        let csr = await storageManager.createStorage('genesis');
        if (csr.err) {
            chain.logger.error(`ValueChainDebugSession init create genesis memory storage failed `, stringifyErrorCode(csr.err));
            return csr.err;
        }
        const dstStorage = csr.storage as JsonStorage;
        const tjsr = await srcStorage.toJsonStorage(dstStorage);
        if (tjsr.err) {
            chain.logger.error(`ValueChainDebugSession init transfer genesis memory storage failed `, stringifyErrorCode(tjsr.err));
            return tjsr.err;
        }

        csr = await this.m_storageManager.createSnapshot(dstStorage, genesisHash, true);
        if (csr.err) {
            chain.logger.error(`ValueChainDebugSession init create genesis memory dump failed `, stringifyErrorCode(csr.err));
            return csr.err;
        }

        return ErrorCode.RESULT_OK;
    }

    async block(hash: string): Promise<{err: ErrorCode}> {
        const chain = this.debuger.chain;
        const block = chain.blockStorage.get(hash);
        if (!block) {
            chain.logger.error(`block ${hash} not found`);
            return {err: ErrorCode.RESULT_NOT_FOUND};
        }
        const csr = await this.m_storageManager!.createStorage(hash, block.header.preBlockHash);
        if (csr.err) {
            chain.logger.error(`block ${hash} create pre block storage failed `, stringifyErrorCode(csr.err));
        }
        const {err} = await this.debuger.debugBlock(csr.storage as JsonStorage, block);
        csr.storage!.remove();
        return {err};
    }

    async transaction(hash: string): Promise<{err: ErrorCode}> {
        const chain = this.debuger.chain;
        const gtrr = await chain.getTransactionReceipt(hash);
        if (gtrr.err) {
            chain.logger.error(`transaction ${hash} get receipt failed `, stringifyErrorCode(gtrr.err));
            return {err: gtrr.err};
        }
        return this.block(gtrr.block!.hash);
    }

    async view(from: string, method: string, params: any): Promise<{err: ErrorCode, value?: any}> {
        const chain = this.debuger.chain;
        
        let hr = await chain.headerStorage.getHeader(from);
        if (hr.err !== ErrorCode.RESULT_OK) {
            chain.logger!.error(`view ${method} failed for load header ${from} failed for ${hr.err}`);
            return {err: hr.err};
        }
        let header = hr.header!;
        let svr = await this.m_storageManager!.getSnapshotView(header.hash);
        if (svr.err !== ErrorCode.RESULT_OK) {
            chain.logger!.error(`view ${method} failed for get snapshot ${header.hash} failed for ${svr.err}`);
            return { err: svr.err };
        }
        const ret = await this.debuger.debugView(svr.storage as JsonStorage, header, method, params);

        this.m_storageManager!.releaseSnapshotView(header.hash);

        return ret;
    }
}

export class ValueIndependDebugSession {
    private m_storage?: JsonStorage;
    private m_curHeader?: ValueBlockHeader;
    private m_accounts?: Buffer[];
    private m_interval?: number;
    private m_fakeNonces: Map<string, number>;
    constructor(private readonly debuger: ValueMemoryDebuger) {
        this.m_fakeNonces = new Map();
    }

    async init(options: {
        height: number, 
        accounts: Buffer[] | number, 
        coinbase: number,
        interval: number,
        preBalance?: BigNumber
    }): Promise<ErrorCode> {
        const csr = await this.debuger.createStorage();
        if (csr.err) {
            return csr.err;
        }
        this.m_storage = csr.storage!;
        if (isArray(options.accounts)) {
            this.m_accounts = options.accounts.map((x) => Buffer.from(x));
        } else {
            this.m_accounts = [];
            for (let i = 0; i < options.accounts; ++i) {
                this.m_accounts.push(createKeyPair()[1]);
            }
        }
        this.m_interval = options.interval;
        const chain = this.debuger.chain;
        let gh = chain.newBlockHeader() as ValueBlockHeader;
        gh.timestamp = Date.now() / 1000;
        let block = chain.newBlock(gh);

        let genesissOptions: any = {};
        genesissOptions.candidates = [];
        genesissOptions.miners = [];
        genesissOptions.coinbase = addressFromSecretKey(this.m_accounts[options.coinbase]);
        if (options.preBalance) {
            genesissOptions.preBalances = [];
            this.m_accounts.forEach((value) => {
                genesissOptions.preBalances.push({address: addressFromSecretKey(value), amount: options.preBalance});
            });
        }  
        const err = await chain.onCreateGenesisBlock(block, csr.storage!, genesissOptions);
        if (err) {
            chain.logger.error(`onCreateGenesisBlock failed for `, stringifyErrorCode(err));
            return err;
        }
        block.header.updateHash();
        const dber = await this.debuger.debugBlockEvent(this.m_storage!, block.header, {preBlock: true});
        if (dber.err) {
            return err;
        }
        this.m_curHeader = block.header as ValueBlockHeader;
        if (options.height > 0) {
            const _err = this.updateHeightTo(options.height, options.coinbase, true);
            if (_err) {
                return _err;
            }
        }
        return ErrorCode.RESULT_OK;
    }

    async updateHeightTo(height: number, coinbase: number, events?: boolean): Promise<ErrorCode> {
        if (height <= this.m_curHeader!.number) {
            this.debuger.chain.logger.error(`updateHeightTo ${height} failed for current height ${this.m_curHeader!.number} is larger`); 
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        let curHeader = this.m_curHeader!;
        if (events) {
            const {err} = await this.debuger.debugBlockEvent(this.m_storage!, curHeader, {postBlock: true});
            if (err) {
                return err;
            }
        }
        const offset = height - curHeader.number;
        for (let i = 0; i < offset; ++i) {
            let header = this.debuger.chain.newBlockHeader() as ValueBlockHeader;
            header.timestamp = curHeader.timestamp + this.m_interval!;
            header.coinbase = addressFromSecretKey(this.m_accounts![coinbase])!;
            header.setPreBlock(curHeader);
            curHeader = header;
            const {err} = await this.debuger.debugBlockEvent(this.m_storage!, curHeader, 
                {preBlock: true, postBlock: curHeader.number !== height});
            return err;
        }

        this.m_curHeader = curHeader;
        return ErrorCode.RESULT_OK;
    }

    transaction(options: {caller: number|Buffer, method: string, input: any, value: BigNumber, fee: BigNumber}): Promise<{err: ErrorCode, receipt?: Receipt}> {
        const tx = new ValueTransaction();
        tx.fee = new BigNumber(0);
        tx.value = new BigNumber(options.value);
        tx.method = options.method;
        tx.input = options.input;
        tx.fee = options.fee;
        let pk: Buffer;
        if (Buffer.isBuffer(options.caller)) {
            pk = options.caller;
        } else {
            pk = this.m_accounts![options.caller]!;
        }
        let addr = addressFromSecretKey(pk)!;
        tx.nonce = this.m_fakeNonces.has(addr) ? this.m_fakeNonces.get(addr)! : 0;
        tx.sign(pk);
        this.m_fakeNonces.set(addr, tx.nonce + 1);
        
        return this.debuger.debugTransaction(this.m_storage!, this.m_curHeader!, tx);
    }

    wage(): Promise<{err: ErrorCode}> {
        return this.debuger.debugMinerWageEvent(this.m_storage!, this.m_curHeader!);
    }

    view(options: {method: string, params: any}): Promise<{err: ErrorCode, value?: any}> {
        return this.debuger.debugView(this.m_storage!, this.m_curHeader!, options.method, options.params);
    }

    getAccount(index: number): string {
        return addressFromSecretKey(this.m_accounts![index])!;
    }
}

class MemoryDebuger {
    constructor(public readonly chain: Chain, protected readonly logger: LoggerInstance) {

    }

    async createStorage(): Promise<{err: ErrorCode, storage?: JsonStorage}> {
        const storage = new JsonStorage({
            filePath: '',
            logger: this.logger
        });
        const err = await storage.init();
        if (err) {
            this.chain.logger.error(`init storage failed `, stringifyErrorCode(err));
            return {err};
        }
        storage.createLogger();
        return {err: ErrorCode.RESULT_OK, storage};
    }

    async debugTransaction(storage: JsonStorage, header: BlockHeader, tx: Transaction): Promise<{err: ErrorCode, receipt?: Receipt}> {
        const block = this.chain.newBlock(header);
        
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return {err: nber.err};
        }
        const etr = await nber.executor!.executeTransaction(tx, {ignoreNoce: true});
        if (etr.err) {
            return {err: etr.err};
        }
        
        return {err: ErrorCode.RESULT_OK, receipt: etr.receipt};
    }

    async debugBlockEvent(storage: JsonStorage, header: BlockHeader, options: {
            listener?: BlockHeightListener,
            preBlock?: boolean,
            postBlock?: boolean
        }): Promise<{err: ErrorCode}> {
        const block = this.chain.newBlock(header);
        
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return {err: nber.err};
        }
        if (options.listener) {
            const err = await nber.executor!.executeBlockEvent(options.listener);
            return {err};
        } else {
            if (options.preBlock) {
                const err = await nber.executor!.executePreBlockEvent();
                if (err) {
                    return {err};
                }
            }
            if (options.postBlock) {
                const err = await nber.executor!.executePostBlockEvent();
                if (err) {
                    return {err};
                }
            }
            return {err: ErrorCode.RESULT_OK};
        }
    }

    async debugView(storage: JsonStorage, header: BlockHeader, method: string, params: any): Promise<{err: ErrorCode, value?: any}> {
        const nver = await this.chain.newViewExecutor(header, storage, method, params);

        if (nver.err) {
            return {err: nver.err};
        }

        return nver.executor!.execute();
    }

    async debugBlock(storage: JsonStorage, block: Block): Promise<{err: ErrorCode}> {
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return {err: nber.err};
        }

        const err = await nber.executor!.execute();
        return {err};
    }
}

export class ValueMemoryDebuger extends MemoryDebuger {
    async debugMinerWageEvent(storage: JsonStorage, header: BlockHeader): Promise<{err: ErrorCode}> {
        const block = this.chain.newBlock(header);
        
        const nber = await this.chain.newBlockExecutor(block, storage);
        if (nber.err) {
            return {err: nber.err};
        }

        const err = await (nber.executor! as ValueBlockExecutor).executeMinerWageEvent();
        return {err};

    }

    createIndependSession(): ValueIndependDebugSession {
        return new ValueIndependDebugSession(this);
    }

    async createChainSession(storageDir: string): Promise<{err: ErrorCode, session?: ValueChainDebugSession}> {
        let err = await this.chain.initComponents();
        if (err) {
            return {err};
        }
        const session = new ValueChainDebugSession(this);
        err = await session.init(storageDir);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, session};
    }
}

export async function createValueDebuger(chainCreator: ChainCreator, dataDir: string): Promise<{err: ErrorCode, debuger?: ValueMemoryDebuger}> {
    const ccir = await chainCreator.createChainInstance(dataDir, {readonly: true, initComponents: false});
    if (ccir.err) {
        chainCreator.logger.error(`create chain instance from ${dataDir} failed `, stringifyErrorCode(ccir.err));
        return {err: ccir.err};
    }
    return {err: ErrorCode.RESULT_OK, debuger: new ValueMemoryDebuger(ccir.chain!, chainCreator.logger)};
}