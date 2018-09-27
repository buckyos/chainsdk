import {Transaction, BlockHeader} from '../block';
import {Chain} from './chain';
import {ErrorCode} from '../error_code';
import {LoggerInstance} from '../lib/logger_util';
import {StorageManager, IReadableStorage} from '../storage';
import {Lock, PriorityLock} from '../lib/Lock';
import { BaseHandler } from '../executor';

export type TransactionWithTime = {tx: Transaction, ct: number};

export class PendingTransactions {
    protected m_transactions: TransactionWithTime[];
    protected m_orphanTx: Map<string, TransactionWithTime[]>;
    protected m_mapNonce: Map<string, number>;
    protected m_logger: LoggerInstance;
    protected m_storageManager: StorageManager;
    protected m_storageView?: IReadableStorage;
    protected m_curHeader?: BlockHeader;
    protected m_txLiveTime: number;
    protected m_pendingLock: Lock;
    protected m_handler: BaseHandler;
    protected m_maxPengdingCount: number;
    protected m_warnPendingCount: number;
    protected m_priorityLock: PriorityLock;
    constructor(options: {storageManager: StorageManager, 
        logger: LoggerInstance, 
        txlivetime: number, 
        handler: BaseHandler, 
        maxPengdingCount: number, 
        warnPendingCount: number}) {
        this.m_transactions = [];
        this.m_orphanTx = new Map();
        this.m_mapNonce = new Map<string, number>();
        this.m_logger = options.logger;
        this.m_storageManager = options.storageManager;
        this.m_txLiveTime = options.txlivetime;
        this.m_pendingLock = new Lock();
        this.m_handler = options.handler;
        this.m_maxPengdingCount = options.maxPengdingCount;
        this.m_warnPendingCount = options.warnPendingCount;
        this.m_priorityLock = new PriorityLock();
    }

    public async sleep(bSleep: boolean) {
        if (bSleep) {
            await this.m_priorityLock.enter(true);
            return;
        }

        await this.m_priorityLock.leave(true);
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
        await this.m_priorityLock.enter(false);
        await this.m_pendingLock.enter();
        // 在存在很多纯内存操作的tx存在的时候，调用一个IO借口给其他microtask一个机会
        await this.getStorageNonce(tx.address!);
        if (this.isExist(tx)) {
            this.m_logger.warn(`addTransaction failed, tx exist,hash=${tx.hash}`);
            await this.m_pendingLock.leave();
            await this.m_priorityLock.leave(false);
            return ErrorCode.RESULT_TX_EXIST;
        }
        let ret: any = await this._addTx({tx, ct: Date.now()});
        await this.m_pendingLock.leave();
        await this.m_priorityLock.leave(false);
        return ret;
    }

    public popTransaction(): Transaction | undefined {
        let txs: TransactionWithTime[] = this._popTransaction(1);
        if (txs.length === 0) {
            return ;
        }

        return txs[0].tx;
    }
    protected _popTransaction(nCount: number): TransactionWithTime[] {
        let txs: TransactionWithTime[] = [];
        let toOrphan: Set<string> = new Set();
        while (this.m_transactions.length > 0 && txs.length < nCount) {
            let txTime: TransactionWithTime = this.m_transactions.shift()!;
            if (this.isTimeout(txTime)) {
                if (!toOrphan.has(txTime.tx.address as string)) {
                    this.m_mapNonce.set(txTime.tx.address as string, txTime.tx.nonce - 1);
                    toOrphan.add(txTime.tx.address as string);
                }
            } else {
                if (toOrphan.has(txTime.tx.address!)) {
                    this.addToOrphan(txTime);
                } else {
                    txs.push(txTime);
                }
            }
        }
        if (toOrphan.size === 0) {
            return txs;
        }

        let pos: number = 0;
        while (pos < this.m_transactions.length) {
            if (this.isTimeout(this.m_transactions[pos])) {
                let txTime: TransactionWithTime = this.m_transactions.shift()!;
                if (!toOrphan.has(txTime.tx.address as string)) {
                    this.m_mapNonce.set(txTime.tx.address as string, txTime.tx.nonce - 1);
                    toOrphan.add(txTime.tx.address as string);
                }
            } else {
                if (toOrphan.has(this.m_transactions[pos].tx.address as string)) {
                    let txTemp: TransactionWithTime = (this.m_transactions.splice(pos, 1)[0]);
                    this.addToOrphan(txTemp);
                } else {
                    pos++;
                }
            }
        }
        return txs;
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
        await this.m_pendingLock.enter(true);
        await this.removeTx();
        await this.m_pendingLock.leave();
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
        this.m_orphanTx.clear();
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

    protected async _addTx(txTime: TransactionWithTime): Promise<ErrorCode> {
        let address: string = txTime.tx.address as string;

        let nCount: number = this.getPengdingCount();
        if (nCount >= this.m_maxPengdingCount) {
            this.m_logger.warn(`pengding count ${nCount}, maxPengdingCount ${this.m_maxPengdingCount}`);
            return ErrorCode.RESULT_OUT_OF_MEMORY;
        }

        let {err, nonce} = await this.getNonce(address);
        if (err) {
            this.m_logger.error(`_addTx getNonce nonce error ${err}`);
            return err;
        }

        if (nonce! + 1 === txTime.tx.nonce) {
            this.addToQueue(txTime, -1);
            this.m_mapNonce.set(txTime.tx.address as string, txTime.tx.nonce);
            await this.ScanOrphan(address);
            return ErrorCode.RESULT_OK;
        }

        if (nonce! + 1 < txTime.tx.nonce) {
            if (nCount >= this.m_warnPendingCount) {
                this.m_logger.warn(`pengding count ${nCount}, warnPengdingCount ${this.m_warnPendingCount}`);
                return ErrorCode.RESULT_OUT_OF_MEMORY;
            }
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

    protected async removeTx() {
        let nonceCache: Map<string, number> = new Map();
        let index: number = 0;
        while (true) {
            if (index === this.m_transactions.length) {
                break;
            }
            let tx: Transaction = this.m_transactions[index].tx;
            let nonce: number = -1;
            if (nonceCache.has(tx.address as string)) {
                nonce = nonceCache.get(tx.address as string)!;
            } else {
                let ret = await this.getStorageNonce(tx.address as string);
                nonce = ret.nonce!;
            }
            if (tx.nonce <= nonce!) {
                this.m_transactions.splice(index, 1);
                if (this.m_mapNonce.has(tx.address as string)) {
                    if ((this.m_mapNonce.get(tx.address as string) as number) <= nonce!) {
                        this.m_mapNonce.delete(tx.address  as string);
                    }
                }
            } else {
                index++;
            }
        }

        for (let [address, l] of this.m_orphanTx) {
            while (true) {
                if (l.length === 0) {
                    break;
                }
                let nonce1: number = -1;
                if (nonceCache.has(l[0].tx.address as string)) {
                    nonce1 = nonceCache.get(l[0].tx.address as string)!;
                } else {
                    let ret = await this.getStorageNonce(l[0].tx.address as string);
                    nonce1 = ret.nonce!;
                }
                if (l[0].tx.nonce <= nonce1) {
                    l.shift();
                } else {
                    break;
                }
            }
        }
        let keys: string[] = [...this.m_orphanTx.keys()];
        for (let address of keys) {
            await this.ScanOrphan(address);
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

    protected clearTimeoutTx(l: TransactionWithTime[]) {
        let pos: number = 0;
        while (pos < l.length) {
            if (this.isTimeout(l[pos])) {
                l.splice(pos, 1);
            } else {
                pos++;
            }
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
                this.clearTimeoutTx(l);
                break;
            }

            if (nonce! + 1 !== l[0].tx.nonce) {
                this.clearTimeoutTx(l);
                break;
            }

            let txTime: TransactionWithTime = l.shift() as TransactionWithTime;
            this.addToQueue(txTime, -1);
            this.m_mapNonce.set(txTime.tx.address as string, txTime.tx.nonce);
            nonce!++;
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

    protected async onReplaceTx(txNew: Transaction, txOld: Transaction): Promise<void> {

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
                let txOld: Transaction = this.m_transactions[i].tx;
                if (this.isTimeout(this.m_transactions[i])) {
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onReplaceTx(txTime.tx, txOld);
                    return ErrorCode.RESULT_OK;
                }

                let _err = await this.checkSmallNonceTx(txTime.tx, this.m_transactions[i].tx);
                if (_err === ErrorCode.RESULT_OK) {
                    this.m_transactions.splice(i, 1);
                    this.addToQueue(txTime, i);
                    await this.onReplaceTx(txTime.tx, txOld);
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
                    await this.onReplaceTx(txTime.tx, txOld);
                    return ErrorCode.RESULT_OK;
                }

                let _err = await this.checkSmallNonceTx(txTime.tx, l[i].tx);
                if (_err === ErrorCode.RESULT_OK) {
                    l.splice(i, 1, txTime);
                    await this.onReplaceTx(txTime.tx, txOld);
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