import {PendingTransactions, TransactionWithTime, Chain, Transaction} from '../chain';
import { ErrorCode } from '../error_code';
import {ValueTransaction} from './transaction';
import {BigNumber} from 'bignumber.js';
import {ValueChain} from './chain';
import {ValueBlockHeader} from './block';

export class ValuePendingTransactions extends PendingTransactions {
    protected m_balance: Map<string, BigNumber> = new Map<string, BigNumber>();

    public async addTransaction(tx: ValueTransaction): Promise<ErrorCode> {
        let br = await this.getBalance(tx.address as string);
        if (br.err) {
            return br.err;
        }
        let balance = br.value!;
        let totalUse: BigNumber = tx.value;
        if (balance.lt(totalUse.plus(tx.fee))) {
            this.m_logger.error(`addTransaction failed, need fee ${tx.fee.toString()} but balance ${balance.toString()}`);
            return ErrorCode.RESULT_NOT_ENOUGH;
        }

        let err = await super.addTransaction(tx);
        if (err) {
            return err;
        }

        return this._updateBalance(tx.address as string, balance.minus(totalUse));
    }

    public async updateTipBlock(header: ValueBlockHeader): Promise<ErrorCode> {
        let err = super.updateTipBlock(header);
        if (err) {
            return err;
        }
        this.m_balance = new Map();
        return err;
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

    protected async _updateBalance(address: string, v: BigNumber): Promise<ErrorCode> {
        let br = await this.getStorageBalance(address);
        if (br.err) {
            return br.err;
        }
        if (br.value!.isEqualTo(v) && this.m_balance.has(address)) {
            this.m_balance.delete(address);
        } else {
            this.m_balance.set(address, v);
        }
        return ErrorCode.RESULT_OK;
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

    protected async onReplaceTx(txNew: ValueTransaction, txOld: ValueTransaction): Promise<void> {
        let br = await this.getBalance(txNew.address as string);
        if (br.err) {
            return ;
        }
        await this._updateBalance(txNew.address as string, br.value!.plus(txOld.value).minus(txNew.value).plus(txOld.fee).minus(txNew.fee));
        return ;
    }
}
