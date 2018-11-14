import assert = require('assert');

import {ErrorCode} from '../error_code';
import {Block, Transaction, Receipt, Storage} from '../chain';
import {BaseHandler, TxListener, BlockHeightListener} from './handler';
import {EventExecutor, TransactionExecutor, TransactionExecuteflag} from './transaction';
import { LoggerInstance } from '../lib/logger_util';

export type BlockExecutorOptions = {
    storage: Storage, 
    block: Block,
    handler: BaseHandler, 
    logger: LoggerInstance,
    externContext: any,
    globalOptions: any
};

export class BlockExecutor {
    protected m_storage: Storage;
    protected m_handler: BaseHandler;
    protected m_block: Block;
    protected m_externContext: any;
    protected m_logger: LoggerInstance;
    protected m_globalOptions: any;
    constructor(options: BlockExecutorOptions) {
        this.m_storage = options.storage;
        this.m_handler = options.handler;
        this.m_block = options.block;
        this.m_externContext = options.externContext;
        this.m_logger = options.logger;
        Object.defineProperty(
            this.m_externContext, 'logger', {
                writable: false,
                value: this.m_logger
            }
        );
        this.m_globalOptions = options.globalOptions;
    }

    public get externContext(): any {
        return this.m_externContext;
    }

    protected _newTransactionExecutor(l: TxListener, tx: Transaction): TransactionExecutor {
        return new TransactionExecutor(l, tx, this.m_logger);
    }
    
    protected _newEventExecutor(l: BlockHeightListener): EventExecutor {
        return new EventExecutor(l, this.m_logger);
    }
 
    public async execute(): Promise<ErrorCode> {
        let t1: number = Date.now();
        let ret = await this._execute(this.m_block);
        let t2: number = Date.now();
        this.m_logger.info(`runblock time====${t2 - t1}, count=${this.m_block.content.transactions.length}`);
        return ret;
    }

    public async verify(): Promise<{err: ErrorCode, valid?: ErrorCode}> {
        let oldBlock = this.m_block;
        this.m_block = this.m_block.clone();
        let err = await this.execute();
        if (err) {
            if (err === ErrorCode.RESULT_TX_CHECKER_ERROR) {
                return {err: ErrorCode.RESULT_OK, valid: ErrorCode.RESULT_TX_CHECKER_ERROR};
            } else {
                return {err};
            }
        }
        if (this.m_block.hash !== oldBlock.hash) {
            this.m_logger.error(`block ${oldBlock.number} hash mismatch!! 
            except storage hash ${oldBlock.header.storageHash}, actual ${this.m_block.header.storageHash}
            except hash ${oldBlock.hash}, actual ${this.m_block.hash}
            `);
        }
        if (this.m_block.hash === oldBlock.hash) {
            return {err: ErrorCode.RESULT_OK, valid: ErrorCode.RESULT_OK}; 
        } else {
            return {err: ErrorCode.RESULT_OK, valid: ErrorCode.RESULT_VERIFY_NOT_MATCH};
        }
    } 

    protected async _execute(block: Block): Promise<ErrorCode> {
        this.m_logger.info(`begin execute block ${block.number}`);
        let err = await this.executePreBlockEvent();
        if (err) {
            this.m_logger.error(`blockexecutor execute begin_event failed,errcode=${err},blockhash=${block.hash}`);
            return err;
        }
        let ret = await this._executeTransactions();
        if (ret.err) {
            this.m_logger.error(`blockexecutor execute method failed,errcode=${ret.err},blockhash=${block.hash}`);
            return ret.err;
        }
        err = await this.executePostBlockEvent();
        if (err) {
            this.m_logger.error(`blockexecutor execute end_event failed,errcode=${err},blockhash=${block.hash}`);
            return err;
        }

        let receipts: Receipt[] = ret.value!;
        // 票据
        block.content.setReceipts(receipts);
        // 更新块信息
        return await this._updateBlock(block);
    }

    public async executeBlockEvent(listener: BlockHeightListener): Promise<ErrorCode> {
        let exec = this._newEventExecutor(listener);
        let ret = await exec.execute(this.m_block.header, this.m_storage, this.m_externContext);
        if (ret.err || ret.returnCode) {
            this.m_logger.error(`block event execute failed`);
            return ErrorCode.RESULT_EXCEPTION;
        }
        return ErrorCode.RESULT_OK;
    }

    public async executePreBlockEvent(): Promise<ErrorCode> {
        if (this.m_block.number === 0) {
            // call initialize
            if (this.m_handler.genesisListener) {
                const err = await this.executeBlockEvent(this.m_handler.genesisListener); 
                if (err) {
                    this.m_logger.error(`handler's genesisListener execute failed`);
                    return ErrorCode.RESULT_EXCEPTION;
                }
            }
        }
        let listeners = await this.m_handler.getPreBlockListeners(this.m_block.number);
        for (let l of listeners) {
            const err = await this.executeBlockEvent(l); 
            if (err) {
                return err;
            }
        }
        return ErrorCode.RESULT_OK;
    }

    public async executePostBlockEvent(): Promise<ErrorCode> {
        let listeners = await this.m_handler.getPostBlockListeners(this.m_block.number);
        for (let l of listeners) {
            const err = await this.executeBlockEvent(l); 
            if (err) {
                return err;
            }
        }
        return ErrorCode.RESULT_OK;
    }

    protected async _executeTransactions(): Promise<{ err: ErrorCode, value?: Receipt[] }> {
        let receipts: Receipt[] = [];
        // 执行tx
        for (let tx of this.m_block.content.transactions) {
            const ret = await this.executeTransaction(tx);
            if (ret.err) {
                return {err: ret.err};
            }
            receipts.push(ret.receipt as Receipt);
        }
        return { err: ErrorCode.RESULT_OK, value: receipts };
    }

    public async executeTransaction(tx: Transaction, flag?: TransactionExecuteflag): Promise<{err: ErrorCode, receipt?: Receipt}> {
        const checker = this.m_handler.getTxPendingChecker(tx.method);
        if (!checker || checker(tx)) {
            this.m_logger.error(`verfiy block failed for tx ${tx.hash} ${tx.method} checker failed`);
            return {err: ErrorCode.RESULT_TX_CHECKER_ERROR};
        }
        let listener: TxListener|undefined = this.m_handler.getTxListener(tx.method);
        assert(listener, `no listener for ${tx.method}`);
        if (!listener) {
            return {err: ErrorCode.RESULT_NOT_SUPPORT};
        }
        let exec = this._newTransactionExecutor(listener!, tx);
        let ret = await exec.execute(this.m_block.header, this.m_storage, this.m_externContext, flag);
        return ret;
    }

    protected async _updateBlock(block: Block): Promise<ErrorCode> {
        // 写回数据库签名
        const mdr = await this.m_storage.messageDigest();
        if (mdr.err) {
            return mdr.err;
        }
        block.header.storageHash = mdr.value!;
        block.header.updateContent(block.content);
        block.header.updateHash();
        return ErrorCode.RESULT_OK;
    }
}