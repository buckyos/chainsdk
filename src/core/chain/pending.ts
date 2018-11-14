import {Transaction, BlockHeader} from '../block';
import {Chain} from './chain';
import {ErrorCode} from '../error_code';
import {LoggerInstance} from '../lib/logger_util';
import {StorageManager, IReadableStorage} from '../storage';
import { BaseHandler } from '../executor';
import {EventEmitter} from 'events';
import {LRUCache} from '../lib/LRUCache';

export type TransactionWithTime = {tx: Transaction, ct: number};
enum SyncOptType {
    updateTip = 0,
    popTx = 1,
    addTx = 2,
}
type SyncOpt = {
    _type: SyncOptType,
    param: any
};

export class PendingTransactions extends EventEmitter {
    protected m_transactions: TransactionWithTime[];
    protected m_orphanTx: Map<string, TransactionWithTime[]>;
    protected m_mapNonce: Map<string, number>;
    protected m_logger: LoggerInstance;
    protected m_storageManager: StorageManager;
    protected m_storageView?: IReadableStorage;
    protected m_curHeader?: BlockHeader;
    protected m_txLiveTime: number;
    protected m_handler: BaseHandler;
    protected m_maxPengdingCount: number;
    protected m_warnPendingCount: number;
    protected m_queueOpt: SyncOpt[] = [];
    protected m_currAdding: SyncOpt | undefined;
    protected m_txRecord: LRUCache<string, number>;

    on(event: 'txAdded', listener: (tx: Transaction) => void): this;
    on(event: string, listener: any): this {
        return super.on(event, listener);
    }

    once(event: 'txAdded', listener: (tx: Transaction) => void): this;
    once(event: string, listener: (tx: Transaction) => void): this {
        return super.once(event, listener);
    }

    constructor(options: {
        storageManager: StorageManager,
        logger: LoggerInstance,
        txlivetime: number,
        handler: BaseHandler,
        maxPengdingCount: number,
        warnPendingCount: number
    }) {
        super();
        this.m_transactions = [];
        this.m_orphanTx = new Map();
        this.m_mapNonce = new Map<string, number>();
        this.m_logger = options.logger;
        this.m_storageManager = options.storageManager;
        this.m_txLiveTime = options.txlivetime;
        this.m_handler = options.handler;
        this.m_maxPengdingCount = options.maxPengdingCount;
        this.m_warnPendingCount = options.warnPendingCount;
        this.m_txRecord = new LRUCache(this.m_maxPengdingCount);
    }

    public async addTransaction(tx: Transaction): Promise<ErrorCode> {
        this.m_logger.debug(`addTransaction, txhash=${tx.hash}, nonce=${tx.nonce}, address=${tx.address}`);
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker) {
            this.m_logger.error(`txhash=${tx.hash} method=${tx.method} has no match listener`);
            return ErrorCode.RESULT_TX_CHECKER_ERROR;
        }
        const err = checker(tx);
        if (err) {
            this.m_logger.error(`txhash=${tx.hash} checker error ${err}`);
            return ErrorCode.RESULT_TX_CHECKER_ERROR;
        }

        let nCount: number = this.getPengdingCount() + this.m_queueOpt.length;
        if (nCount >= this.m_maxPengdingCount) {
            this.m_logger.warn(`pengding count ${nCount}, maxPengdingCount ${this.m_maxPengdingCount}`);
            return ErrorCode.RESULT_OUT_OF_MEMORY;
        }

        let latest: number | null = this.m_txRecord.get(tx.hash);
        if (latest && Date.now() - latest < 2 * 60 * 1000) {
            this.m_logger.warn(`addTransaction failed, add too frequently,hash=${tx.hash}`);
            return ErrorCode.RESULT_TX_EXIST;
        }
        this.m_txRecord.set(tx.hash, Date.now());

        if (this.isExist(tx)) {
            this.m_logger.warn(`addTransaction failed, tx exist,hash=${tx.hash}`);
            return ErrorCode.RESULT_TX_EXIST;
        }
        
        let opt: SyncOpt = {_type: SyncOptType.addTx, param: {tx, ct: Date.now()}};
        this.addPendingOpt(opt);
        return ErrorCode.RESULT_OK;
    }

    public popTransaction(): Transaction | undefined {
        if (this.m_transactions.length > 0) {
            return this.m_transactions[0].tx;
        } else {
            return undefined;
        }
    }

    public async updateTipBlock(header: BlockHeader): Promise<ErrorCode> {
        let svr = await this.m_storageManager.getSnapshotView(header.hash);
        if (svr.err) {
            this.m_logger.error(`updateTipBlock getSnapshotView failed, errcode=${svr.err},hash=${header.hash},number=${header.number}`);
            return svr.err;
        }
        if (this.m_curHeader) {
            this.m_storageManager.releaseSnapshotView(this.m_curHeader.hash);
        }
        this.m_curHeader = header;
        this.m_storageView = svr.storage!;

        this.addPendingOpt({_type: SyncOptType.updateTip, param: undefined});
        return ErrorCode.RESULT_OK;
    }

    public init(): ErrorCode {
        return ErrorCode.RESULT_OK;
    }

    public uninit() {
        if (this.m_curHeader) {
            this.m_storageManager.releaseSnapshotView(this.m_curHeader.hash);
            delete this.m_storageView;
            delete this.m_curHeader;
        }
        this.m_mapNonce.clear();
    }

    protected isExist(tx: Transaction): boolean {
        for (let t of this.m_transactions) {
            if (t.tx.hash === tx.hash) {
                return true;
            }
        }

        if (!this.m_orphanTx.get(tx.address as string)) {
            return false;
        }

        for (let orphan of this.m_orphanTx.get(tx.address as string) as TransactionWithTime[]) {
            if (tx.hash === orphan.tx.hash) {
                return true;
            }
        }
        return false;
    }

    protected async addPendingOpt(opt: SyncOpt) {
        if (opt._type === SyncOptType.updateTip) {
            for (let i = 0; i < this.m_queueOpt.length; i++) {
                if (this.m_queueOpt[i]._type === SyncOptType.addTx) {
                    break;
                } else if (this.m_queueOpt[i]._type === SyncOptType.updateTip) {
                    this.m_queueOpt.splice(i, 1);
                    break;
                }
            }
            this.m_queueOpt.unshift(opt);
        } else if (opt._type === SyncOptType.addTx) {
            this.m_queueOpt.push(opt);
        }

        if (this.m_currAdding) {
            return;
        }

        while (this.m_queueOpt.length > 0) {
            this.m_currAdding = this.m_queueOpt.shift();
            if (this.m_currAdding!._type === SyncOptType.updateTip) {
                let pos: number = 0;
                for (pos = 0; pos < this.m_queueOpt.length; pos++) {
                    if (this.m_queueOpt[pos]._type === SyncOptType.addTx) {
                        break;
                    }
                }
                for (let i = 0; i < this.m_transactions.length; i++) {
                    this.m_queueOpt.splice(i + pos, 0, {_type: SyncOptType.addTx, param: this.m_transactions[i]});
                }
                this.m_mapNonce = new Map();
                this.m_transactions = [];
            } else if (this.m_currAdding!._type === SyncOptType.addTx) {
                await this._addTx(this.m_currAdding!.param as TransactionWithTime);
            }
            this.m_currAdding = undefined;
        }
    }

    protected async onCheck(txTime: TransactionWithTime,  txOld?: TransactionWithTime): Promise<ErrorCode> {
        return ErrorCode.RESULT_OK;
    }

    protected async onAddedTx(txTime: TransactionWithTime, txOld?: TransactionWithTime): Promise<ErrorCode> {
        if (!txOld) {
            this.m_mapNonce.set(txTime.tx.address as string, txTime.tx.nonce);
        }
        this.emit('txAdded', txTime.tx);
        return ErrorCode.RESULT_OK;
    }

    protected async _addTx(txTime: TransactionWithTime): Promise<ErrorCode> {
        if (this.isTimeout(txTime)) {
            this.m_logger.warn(`_addTx tx timeout, txhash=${txTime.tx.hash}`);
            return ErrorCode.RESULT_TIMEOUT;
        }
        let address: string = txTime.tx.address as string;
        let ret = await this.getStorageNonce(address);
        if (ret.err) {
            this.m_logger.error(`_addTx getNonce nonce error ${ret.err} address=${address}, txhash=${txTime.tx.hash}`);
            return ret.err;
        }
        if (ret.nonce! + 1 > txTime.tx.nonce) {
            // this.m_logger.warn(`_addTx nonce small storagenonce=${ret.nonce!},txnonce=${txTime.tx.nonce}, txhash=${txTime.tx.hash}`);
            return ErrorCode.RESULT_OK;
        }

        let { err, nonce } = await this.getNonce(address);
        this.m_logger.debug(`_addTx, nonce=${nonce}, txNonce=${txTime.tx.nonce}, txhash=${txTime.tx.hash}, address=${txTime.tx.address}`);
        if (nonce! + 1 === txTime.tx.nonce) {
            let retCode = await this.onCheck(txTime);
            if (retCode) {
                return retCode;
            }
            this.addToQueue(txTime, -1);
            await this.onAddedTx(txTime);
            await this.ScanOrphan(address);
            return ErrorCode.RESULT_OK;   
        }

        if (nonce! + 1 < txTime.tx.nonce) {
            return await this.addToOrphanMayNonceExist(txTime);
        }

        return await this.addToQueueMayNonceExist(txTime);
    }

    // 同个address的两个相同nonce的tx存在，且先前的也还没有入链
    protected async checkSmallNonceTx(txNew: Transaction, txOld: Transaction): Promise<ErrorCode> {
        return ErrorCode.RESULT_ERROR_NONCE_IN_TX;
    }

    // 获取mem中的nonce值
    public async getNonce(address: string): Promise<{err: ErrorCode, nonce?: number}> {
        if (this.m_mapNonce.has(address)) {
            return {err: ErrorCode.RESULT_OK, nonce: this.m_mapNonce.get(address) as number};
        } else {
            return await this.getStorageNonce(address);
        }
    }

    public async getStorageNonce(s: string): Promise<{err: ErrorCode, nonce?: number}> {
        try {
            let dbr = await this.m_storageView!.getReadableDataBase(Chain.dbSystem);
            if (dbr.err) {
                this.m_logger.error(`get system database failed ${dbr.err}`);
                return {err: dbr.err};
            }
            let nonceTableInfo = await dbr.value!.getReadableKeyValue(Chain.kvNonce);
            if (nonceTableInfo.err) {
                this.m_logger.error(`getStorageNonce, getReadableKeyValue failed,errcode=${nonceTableInfo.err}`);
                return {err: nonceTableInfo.err};
            }
            let ret = await nonceTableInfo.kv!.get(s);
            if (ret.err) {
                if (ret.err === ErrorCode.RESULT_NOT_FOUND) {
                    return {err: ErrorCode.RESULT_OK, nonce: -1};
                }
                return {err: ret.err};
            }
            return {err: ErrorCode.RESULT_OK, nonce: ret.value as number};
        } catch (error) {
            this.m_logger.error(`getStorageNonce exception, error=${error},address=${s}`);
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }

    protected addToOrphan(txTime: TransactionWithTime) {
        let s: string = txTime.tx.address as string;
        let l: TransactionWithTime[];
        if (this.m_orphanTx.has(s)) {
            l = this.m_orphanTx.get(s) as TransactionWithTime[];
        } else {
            l = new Array<TransactionWithTime>();
            this.m_orphanTx.set(s, l);
        }
        if (l.length === 0) {
            l.push(txTime);
        } else {
            for (let i = 0; i < l.length; i++) {
                if (txTime.tx.nonce < l[i].tx.nonce) {
                    l.splice(i, 0, txTime);
                    return;
                }
            }
            l.push(txTime);
        }
    }

    protected async ScanOrphan(s: string) {
        if (!this.m_orphanTx.has(s)) {
            return;
        }

        let l: TransactionWithTime[] = this.m_orphanTx.get(s) as TransactionWithTime[];

        let {err, nonce} = await this.getNonce(s);
        while (true) {
            if (l.length === 0) {
                this.m_orphanTx.delete(s);
                break;
            }

            if (this.isTimeout(l[0])) {
                l.shift();
                continue;
            }

            if (nonce! + 1 === l[0].tx.nonce) {
                let txTime: TransactionWithTime = l.shift() as TransactionWithTime;
                this.addPendingOpt({_type: SyncOptType.addTx, param: txTime});
            }
            break;
        }
    }

    protected isTimeout(txTime: TransactionWithTime): boolean {
        return Date.now() >= txTime.ct + this.m_txLiveTime * 1000;
    }

    protected addToQueue(txTime: TransactionWithTime, pos: number) {
        if (pos === -1) {
            this.m_transactions.push(txTime);
        } else {
            this.m_transactions.splice(pos, 0, txTime);
        }
    }

    protected getPengdingCount(): number {
        let count = this.m_transactions.length;
        for (let [address, l] of this.m_orphanTx) {
            count += l.length;
        }
        return count;
    }

    protected async addToQueueMayNonceExist(txTime: TransactionWithTime): Promise<ErrorCode> {
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address && this.m_transactions[i].tx.nonce === txTime.tx.nonce) {
                let txOld: TransactionWithTime = this.m_transactions[i];
                if (this.isTimeout(this.m_transactions[i])) {
                    let retCode = await this.onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onAddedTx(txTime, txOld);
                    return ErrorCode.RESULT_OK;
                }

                let _err = await this.checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                if (_err === ErrorCode.RESULT_OK) {
                    let retCode = await this.onCheck(txTime, txOld);
                    if (retCode) {
                        return retCode;
                    }
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onAddedTx(txTime, txOld);
                    return ErrorCode.RESULT_OK;
                }
                return _err;
            }
        }
        return ErrorCode.RESULT_ERROR_NONCE_IN_TX;
    }
    protected async addToOrphanMayNonceExist(txTime: TransactionWithTime): Promise<ErrorCode> {
        let s: string = txTime.tx.address as string;
        let l: TransactionWithTime[];
        if (this.m_orphanTx.has(s)) {
            l = this.m_orphanTx.get(s) as TransactionWithTime[];
        } else {
            l = new Array<TransactionWithTime>();
            this.m_orphanTx.set(s, l);
        }
        if (l.length === 0) {
            l.push(txTime);
            return ErrorCode.RESULT_OK;
        }
        for (let i = 0; i < l.length; i++) {
            if (txTime.tx.nonce === l[i].tx.nonce) {
                let txOld: Transaction = l[i].tx;
                if (this.isTimeout(l[i])) {
                    l.splice(i, 1, txTime);
                    return ErrorCode.RESULT_OK;
                }

                let _err = await this.checkSmallNonceTx(txTime.tx, l[i].tx);
                if (_err === ErrorCode.RESULT_OK) {
                    l.splice(i, 1, txTime);
                    return ErrorCode.RESULT_OK;
                }
                return _err;
            }

            if (txTime.tx.nonce < l[i].tx.nonce) {
                l.splice(i, 0, txTime);
                return ErrorCode.RESULT_OK;
            }
        }
        l.push(txTime);

        return ErrorCode.RESULT_OK;
    }
}