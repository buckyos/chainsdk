import {BigNumber} from 'bignumber.js';
import {ErrorCode} from '../error_code';
import {isValidAddress} from '../address';

import {Transaction, BlockHeader, Receipt, BlockExecutor, TxListener, TransactionExecutor, Storage, IReadableKeyValue, IReadWritableKeyValue, Chain, TransactionExecuteflag} from '../chain';
import {Context} from './context';
import {ValueHandler} from './handler';
import {ValueTransaction, ValueReceipt} from './transaction';
import {ValueBlockHeader} from './block';
import {ValueChain} from './chain';
import { LoggerInstance } from '../lib/logger_util';
import { isNumber } from 'util';

const assert = require('assert');

export class ValueBlockExecutor extends BlockExecutor {
    protected _newTransactionExecutor(l: TxListener, tx: ValueTransaction): TransactionExecutor {
        return new ValueTransactionExecutor(l, tx, this.m_logger);
    }

    async executeMinerWageEvent(): Promise<ErrorCode> {
        let l = (this.m_handler as ValueHandler).getMinerWageListener();
        let wage = await l(this.m_block.number);
        let kvBalance = (await this.m_storage.getKeyValue(Chain.dbSystem, ValueChain.kvBalance)).kv!;
        let ve = new Context(kvBalance);
        let coinbase = (this.m_block.header as ValueBlockHeader).coinbase;
        assert(isValidAddress(coinbase), `block ${this.m_block.hash} has no coinbase set`);
        if (!isValidAddress(coinbase)) {
            coinbase = ValueChain.sysAddress;
        }
        return await ve.issue(coinbase, wage);
    }

    public async executePreBlockEvent(): Promise<ErrorCode> {
        const err = await this.executeMinerWageEvent();
        if (err) {
            return err;
        }
        return await super.executePreBlockEvent();
    }    
}

export class ValueTransactionExecutor extends TransactionExecutor {
    constructor(listener: TxListener, tx: Transaction, logger: LoggerInstance) {
        super(listener, tx, logger);
        this.m_totalCost = new BigNumber(0);
    }

    protected m_totalCost: BigNumber;

    protected async prepareContext(blockHeader: BlockHeader, storage: Storage, externContext: any): Promise<any> {
        let context = await super.prepareContext(blockHeader, storage, externContext);
        
        Object.defineProperty(
            context, 'value', {
                writable: false,
                value: (this.m_tx as ValueTransaction).value
            }
            
        );

        Object.defineProperty(
            context, 'fee', {
                writable: false,
                value: (this.m_tx as ValueTransaction).fee
            }
            
        );

        context.cost = (fee: BigNumber): ErrorCode => {
            let totalCost = this.m_totalCost;
            totalCost = totalCost.plus(fee);
            if (totalCost.gt((this.m_tx as ValueTransaction).fee)) {
                this.m_totalCost = (this.m_tx as ValueTransaction).fee;
                return ErrorCode.RESULT_TX_FEE_NOT_ENOUGH;
            } else {
                this.m_totalCost = totalCost;
                return ErrorCode.RESULT_OK;
            }
        };

        return context;
    }

    public async execute(blockHeader: BlockHeader, storage: Storage, externContext: any, flag?: TransactionExecuteflag): Promise<{err: ErrorCode, receipt?: Receipt}> {
        if (!(flag && flag.ignoreNoce)) {
            let nonceErr = await this._dealNonce(this.m_tx, storage);
            if (nonceErr !== ErrorCode.RESULT_OK) {
                return {err:  nonceErr};
            }
        } 
        let kvBalance = (await storage.getKeyValue(Chain.dbSystem, ValueChain.kvBalance)).kv!;
        let fromAddress: string = this.m_tx.address!;
        let nFee: BigNumber = (this.m_tx as ValueTransaction).fee;
        let nToValue: BigNumber = (this.m_tx as ValueTransaction).value.plus(nFee);

        let receipt: ValueReceipt = new ValueReceipt(); 
        let ve = new Context(kvBalance);
        if ((await ve.getBalance(fromAddress)).lt(nToValue)) {
            this.m_logger.error(`methodexecutor failed for value not enough need ${nToValue.toString()} but ${(await ve.getBalance(fromAddress)).toString()} address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            receipt.returnCode = ErrorCode.RESULT_NOT_ENOUGH;
            receipt.transactionHash = this.m_tx.hash; 
            return {err: ErrorCode.RESULT_OK, receipt};
        }
        
        let context: any = await this.prepareContext(blockHeader, storage, externContext);

        let work = await storage.beginTransaction();
        if (work.err) {
            this.m_logger.error(`methodexecutor failed for beginTransaction failed,address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            return {err: work.err};
        }
        let err = await ve.transferTo(fromAddress, ValueChain.sysAddress, (this.m_tx as ValueTransaction).value);
        if (err) {
            this.m_logger.error(`methodexecutor failed for transferTo sysAddress failed,address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            await work.value!.rollback();
            return {err};
        }
        receipt.returnCode = await this._execute(context, this.m_tx.input);
        receipt.cost = this.m_totalCost;
        assert(isNumber(receipt.returnCode), `invalid handler return code ${receipt.returnCode}`);
        if (!isNumber(receipt.returnCode)) {
            this.m_logger.error(`methodexecutor failed for invalid handler return code type, return=${receipt.returnCode},address=${this.m_tx.address}, hash=${this.m_tx.hash}`);
            return {err: ErrorCode.RESULT_INVALID_PARAM};
        }
        receipt.transactionHash = this.m_tx.hash;
        if (receipt.returnCode) {
            await work.value!.rollback();
        } else {
            receipt.eventLogs = this.m_logs;
            err = await work.value!.commit();
        }
        let coinbase = (blockHeader as ValueBlockHeader).coinbase;
        assert(isValidAddress(coinbase), `block ${blockHeader.hash} has no coinbase set`);
        if (!isValidAddress(coinbase)) {
            coinbase = ValueChain.sysAddress;
        }
        err = await ve.transferTo(fromAddress, coinbase, receipt.cost);
        if (err) {
            return {err};
        }
        return {err: ErrorCode.RESULT_OK, receipt};
    }
}
