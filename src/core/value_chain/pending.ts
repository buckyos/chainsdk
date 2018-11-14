import {PendingTransactions, TransactionWithTime, Chain, Transaction} from '../chain';
import { ErrorCode } from '../error_code';
import {ValueTransaction} from './transaction';
import {BigNumber} from 'bignumber.js';
import {ValueChain} from './chain';
import {ValueBlockHeader} from './block';

export class ValuePendingTransactions extends PendingTransactions {
    protected m_balance: Map<string, BigNumber> = new Map<string, BigNumber>();

    protected async onCheck(txTime: TransactionWithTime,  txOld?: TransactionWithTime): Promise<ErrorCode> {
        let ret = await super.onCheck(txTime, txOld);
        if (ret) {
            return ret;
        }

        let br = await this.getBalance(txTime.tx.address as string);
        if (br.err) {
            return br.err;
        }
        let balance = br.value!;
        let txValue: ValueTransaction = txTime.tx as ValueTransaction;
        let totalUse: BigNumber = txValue.value.plus(txValue.fee);
        if (txOld) {
            let txOldValue: ValueTransaction = txOld.tx as ValueTransaction;
            totalUse = totalUse.minus(txOldValue.value).minus(txOldValue.fee);
        }
        if (balance.lt(totalUse)) {
            this.m_logger.error(`addTransaction failed, need total ${totalUse.toString()} but balance ${balance.toString()}`);
            return ErrorCode.RESULT_NOT_ENOUGH;
        }
        return ErrorCode.RESULT_OK;
    }
    protected async onAddedTx(txTime: TransactionWithTime, txOld?: TransactionWithTime): Promise<ErrorCode> {
        let br = await this.getBalance(txTime.tx.address as string);
        if (br.err) {
            return br.err;
        }
        let balance = br.value!;
        let txValue: ValueTransaction = txTime.tx as ValueTransaction;
        if (txOld) {
            let txOldValue: ValueTransaction = txOld.tx as ValueTransaction;
            balance = balance.plus(txOldValue.fee).plus(txOldValue.value).minus(txValue.fee).minus(txValue.value); 
        } else {
            balance = balance.minus(txValue.fee).minus(txValue.value);
        }
        this.m_balance.set(txTime.tx.address as string, balance);

        return await super.onAddedTx(txTime);
    }

    public async updateTipBlock(header: ValueBlockHeader): Promise<ErrorCode> {
        this.m_balance = new Map();
        return await super.updateTipBlock(header);
    }

    protected async getStorageBalance(s: string): Promise<{err: ErrorCode, value?: BigNumber}> {
        try {
            let dbr = await this.m_storageView!.getReadableDataBase(Chain.dbSystem);
            if (dbr.err) {
                return {err: dbr.err};
            }
            let kvr = await dbr.value!.getReadableKeyValue(ValueChain.kvBalance);
            if (kvr.err !== ErrorCode.RESULT_OK) {
                return {err: kvr.err};
            }
            let ret = await kvr.kv!.get(s);
            if (!ret.err) {
                return ret;
            } else if (ret.err === ErrorCode.RESULT_NOT_FOUND) {
                return {err: ErrorCode.RESULT_OK, value: new BigNumber(0)};
            } else {
                return {err: ret.err};
            }
            
        } catch (error) {
            this.m_logger.error(`getStorageBalance error=${error}`);
            return { err: ErrorCode.RESULT_EXCEPTION };
        }
    }

    // 获取pending中的balance
    protected async getBalance(s: string): Promise<{ err: ErrorCode, value?: BigNumber}> {
        if (this.m_balance.has(s)) {
            return { err: ErrorCode.RESULT_OK, value: this.m_balance.get(s)};
        }
        return this.getStorageBalance(s);
    }

    protected async checkSmallNonceTx(txNew: ValueTransaction, txOld: ValueTransaction): Promise<ErrorCode> {
        if (txNew.fee.gt(txOld.fee)) {
            return ErrorCode.RESULT_OK;
        }

        return ErrorCode.RESULT_FEE_TOO_SMALL;
    }

    protected addToQueue(txTime: TransactionWithTime, pos: number) {
        pos = 0;
        for (let i = 0; i < this.m_transactions.length; i++) {
            if (this.m_transactions[i].tx.address === txTime.tx.address) {
                pos = this.m_transactions[i].tx.nonce < txTime.tx.nonce ? i + 1 : i;
            } else {
                pos = (this.m_transactions[i].tx as ValueTransaction).fee.lt((txTime.tx as ValueTransaction).fee) ? i : i + 1;
            }
        }
        this.m_transactions.splice(pos, 0, txTime);
    }

    public popTransactionWithFee(maxFee: BigNumber): ValueTransaction[] {
        let txs: ValueTransaction[] = [];
        let total: BigNumber = new BigNumber(0);
        for (let pos = 0; pos < this.m_transactions.length; pos++) {
            total = total.plus((this.m_transactions[pos].tx as ValueTransaction).fee);
            if (total.gt(maxFee)) {
                break;
            }
            txs.push(this.m_transactions[pos].tx as ValueTransaction);
        }

        return txs;
    }
}
