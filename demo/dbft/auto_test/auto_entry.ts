import { initLogger, ChainClient, BigNumber, ErrorCode, md5, sign, addressFromSecretKey, ValueTransaction} from '../../../src/client';
import { IOperation } from './baseinterface';
import { BaseCheckPoint } from './checkpoint';
import { GetBalanceCheckPoint, TransferToCheckPoint, RegisterCheckPoint, UnRegisterCheckPoint } from './tx_checkpoint';
import { MinerCheckPoint, UnMinerCheckPoint } from './miner_checkpoint';
import { NewProcessCheckPoint, KillProcessCheckPoint } from './process_checkpoint';

import * as ChildProcess from 'child_process';

export type AutoEntryOptions = {
    secret: string;
    host: string;
    port: number;
};

export class AutoEntry implements IOperation {
    protected m_address: string;
    protected m_chainClient: ChainClient;
    protected m_watchingTx: { hash: string, v: any } | undefined;
    protected m_tipnumber: number = 0;
    protected m_process: Map<string, ChildProcess.ChildProcess> = new Map();
    protected m_cps: Map<string, BaseCheckPoint> = new Map();
    protected m_currCp: BaseCheckPoint | undefined;
    constructor(protected options: AutoEntryOptions) {
        this.m_address = addressFromSecretKey(options.secret)!;
        this.m_chainClient = new ChainClient({
            host: options.host,
            port: options.port,
            logger: initLogger({ loggerOptions: { console: false } })
        });

        this.m_chainClient.on('tipBlock', async (tipBlock) => {
            this.m_tipnumber = tipBlock.number;
            if (this.m_watchingTx) {
                let { err, block, receipt } = await this.m_chainClient.getTransactionReceipt({ tx: this.m_watchingTx!.hash });
                if (!err) {
                    if (receipt.returnCode !== 0) {
                        this.m_watchingTx!.v(receipt.returnCode);
                    } else if (tipBlock.number - block.number + 1 >= 6) {
                        this.m_watchingTx!.v(0);
                    }
                }
            }
            if (this.m_currCp) {
                await this.m_currCp.onTipChange(this, tipBlock);
            }
        });

        this.m_cps.set('getBalance', new GetBalanceCheckPoint());
        this.m_cps.set('transferTo', new TransferToCheckPoint());
        this.m_cps.set('register', new RegisterCheckPoint());
        this.m_cps.set('unregister', new UnRegisterCheckPoint());
        this.m_cps.set('minerExist', new MinerCheckPoint());
        this.m_cps.set('minerNotExist', new UnMinerCheckPoint());
        this.m_cps.set('newProcess', new NewProcessCheckPoint());
        this.m_cps.set('killProcess', new KillProcessCheckPoint());
        this.m_cps.set('newBlock', new  BaseCheckPoint());
    }

    public async check(cps: { cp: string, tag: string, param: any, bestRet: any }[]) {
        for (let cp of cps) {
            console.log(`------begin check tag '${cp.tag}'`);
            if (!this.m_cps.has(cp.cp)) {
                console.log(`not exist checkpoint '${cp.cp}' entry`);
                return;
            }

            this.m_currCp = this.m_cps.get(cp.cp)!;
            let err = await this.m_currCp.check(this, cp.tag, cp.param, cp.bestRet);
            if (err) {
                process.exit(0);
                return;
            }
        }
        console.log(`==========finish`);
        process.exit(0);
    }

    public async waitResult(txhash: string) {
        return await new Promise<ErrorCode>((resolve) => {
            this.m_watchingTx = { hash: txhash, v: resolve };
        });
    }

    public getAddress(): string {
        return this.m_address;
    }
    public async getBalance(address: string): Promise<BigNumber> {
        let ret = await this.m_chainClient.view({
            method: 'getBalance',
            params: { address }
        });

        return ret.value!;
    }
    public async transferTo(to: string, amount: string): Promise<ErrorCode> {
        let tx = new ValueTransaction();
        tx.method = 'transferTo';
        tx.value = new BigNumber(amount);
        tx.fee = new BigNumber(1);
        tx.input = { to };
        let { err, nonce } = await this.m_chainClient.getNonce({ address: this.m_address });
        if (err) {
            console.error(`transferTo failed for ${err}`);
            return err;
        }
        tx.nonce = nonce! + 1;
        tx.sign(this.options.secret);
        let sendRet = await this.m_chainClient.sendTransaction({ tx });
        if (sendRet.err) {
            console.error(`transferTo failed for ${sendRet.err}`);
            return sendRet.err;
        }
        return await this.waitResult(tx.hash);
    }
    public async register(address: string): Promise<ErrorCode> {
        let tx = new ValueTransaction();
        tx.method = 'register';
        tx.fee = new BigNumber(1);
        let signstr = sign(Buffer.from(md5(Buffer.from(address, 'hex')).toString('hex')), this.options.secret).toString('hex');
        tx.input = { address, sign: signstr };
        let { err, nonce } = await this.m_chainClient.getNonce({ address: this.m_address });
        if (err) {
            console.error(`register failed for ${err}`);
            return err;
        }
        tx.nonce = nonce! + 1;
        tx.sign(this.options.secret);
        let sendRet = await this.m_chainClient.sendTransaction({ tx });
        if (sendRet.err) {
            console.error(`register failed for ${sendRet.err}`);
            return sendRet.err;
        }
        return await this.waitResult(tx.hash);
    }
    public async unregister(address: string): Promise<ErrorCode> {
        let tx = new ValueTransaction();
        tx.method = 'unregister';
        tx.fee = new BigNumber(1);
        let signstr = sign(Buffer.from(md5(Buffer.from(address, 'hex')).toString('hex')), this.options.secret).toString('hex');
        tx.input = { address, sign: signstr };
        let { err, nonce } = await this.m_chainClient.getNonce({ address: this.m_address });
        if (err) {
            console.error(`unregister failed for ${err}`);
            return err;
        }
        tx.nonce = nonce! + 1;
        tx.sign(this.options.secret);
        let sendRet = await this.m_chainClient.sendTransaction({ tx });
        if (sendRet.err) {
            console.error(`unregister failed for ${sendRet.err}`);
            return sendRet.err;
        }
        return await this.waitResult(tx.hash);
    }
    public async getMiners(): Promise<{ err: ErrorCode, miners?: string[] }> {
        let ret = await this.m_chainClient.view({
            method: 'getMiners',
            params: {}
        });
        if (ret.err) {
            console.error(`getMiners failed for ${ret.err};`);
            return { err: ret.err };
        }
        let miners: string[] = [];
        for (let i = 0; i < ret.value!.length; i++) {
            miners.push(ret.value![i]);
        }
        return {err: ret.err, miners};
    }
    public async isMiners(address: string): Promise<{ err: ErrorCode, isminer?: boolean }> {
        let ret = await this.m_chainClient.view({
            method: 'isMiner',
            params: { address }
        });
        if (ret.err) {
            console.error(`isMiner failed for ${ret.err};`);
            return { err: ret.err };
        }
        console.log(`${ret.value!}`);
        return ret;
    }

    public async newProcess(id: string, command: string, argv: string[]): Promise<ErrorCode> {
        if (this.m_process.has(id)) {
            console.error(`newProcess failed, process ${id} exist`);
            return ErrorCode.RESULT_FAILED;
        }

        let process = ChildProcess.spawn(command, argv);
        this.m_process.set(id, process);
        process.on('close', (code: number) => {
            this.m_process.delete(id);
        });
        return ErrorCode.RESULT_OK;
    }
    public async killProcess(id: string): Promise<ErrorCode> {
        if (!this.m_process.has(id)) {
            console.error(`killProcess failed, process ${id} not exist`);
            return ErrorCode.RESULT_FAILED;
        }

        this.m_process.get(id)!.kill();
        this.m_process.delete(id);
        return ErrorCode.RESULT_OK;
    }
}