import { ErrorCode } from '../error_code';
import {Block, Transaction, Receipt} from '../block';
import {Storage} from '../storage';
import {BlockExecutorRoutine, IBlockExecutorRoutineManager, BlockExecutorRoutineState} from './executor_routine';
import {Chain} from './chain';
import { BlockExecutor, BlockHeightListener, TransactionExecuteflag } from '../executor';

export class InprocessRoutineManager implements IBlockExecutorRoutineManager {
    constructor(chain: Chain) {
        this.m_chain = chain;
    }
    private m_chain: Chain;

    create(options: { name: string, block: Block, storage: Storage}): {err: ErrorCode, routine: BlockExecutorRoutine} {
        const routine = new InprogressRoutine({
            name: options.name, 
            chain: this.m_chain,
            block: options.block,
            storage: options.storage
        });
        return {err: ErrorCode.RESULT_OK, routine};
    }
}

class InprogressRoutine extends BlockExecutorRoutine {
    constructor(options: {
        name: string, 
        chain: Chain,
        block: Block,
        storage: Storage
    }) {
        super({
            name: options.name, 
            logger: options.chain.logger,
            block: options.block,
            storage: options.storage
        });
        this.m_chain = options.chain;
    }

    private m_chain: Chain;
    private m_state: BlockExecutorRoutineState = BlockExecutorRoutineState.init;
    private m_cancelSet: boolean = false;
    private m_canceled: boolean = false;

    async execute(): Promise<{err: ErrorCode, result?: {err: ErrorCode}}> {
        if (this.m_state !== BlockExecutorRoutineState.init) {
            return {err: ErrorCode.RESULT_INVALID_STATE};
        }
        this.m_state = BlockExecutorRoutineState.running;
        let ner = await this._newBlockExecutor(this.block, this.storage);
        if (ner.err) {
            this.m_state = BlockExecutorRoutineState.finished;
            return {err: ner.err};
        }
        const err = await ner.executor!.execute();

        if (this.m_cancelSet && !this.m_canceled) {
            this.m_canceled = true;
        }
        this.m_state = BlockExecutorRoutineState.finished;
        if (this.m_canceled) {
            return {err: ErrorCode.RESULT_CANCELED};
        } else {
            return {err: ErrorCode.RESULT_OK, result: {err}};
        }
    }

    async verify(): Promise<{err: ErrorCode, result?: {err: ErrorCode, valid?: ErrorCode}}> {
        if (this.m_state !== BlockExecutorRoutineState.init) {
            return {err: ErrorCode.RESULT_INVALID_STATE};
        }
        this.m_state = BlockExecutorRoutineState.running;
        let ner = await this._newBlockExecutor(this.block, this.storage);
        if (ner.err) {
            this.m_state = BlockExecutorRoutineState.finished;
            return {err: ner.err};
        }
        const result = await ner.executor!.verify();
        
        if (this.m_cancelSet && !this.m_canceled) {
            this.m_canceled = true;
        }
        this.m_state = BlockExecutorRoutineState.finished;
        if (this.m_canceled) {
            return {err: ErrorCode.RESULT_CANCELED};
        } else {
            return {err: ErrorCode.RESULT_OK, result};
        }
    }

    cancel(): void {
        if (this.m_state === BlockExecutorRoutineState.finished) {
            return ;
        } else if (this.m_state === BlockExecutorRoutineState.init) {
            this.m_state = BlockExecutorRoutineState.finished; 
            return ;
        }
        this.m_cancelSet = true;
    }

    protected async _newBlockExecutor(block: Block, storage: Storage): Promise<{err: ErrorCode, executor?: BlockExecutor}> {
        let nber = await this.m_chain.newBlockExecutor(block, storage);
        if (nber.err) {
            this.m_canceled = true;
            return nber;
        }
        let executor = nber.executor!;
        const originExecuteBlockEvent = executor.executeBlockEvent;
        executor.executeBlockEvent = async (listener: BlockHeightListener): Promise<ErrorCode> => {
            if (this.m_cancelSet) {
                return ErrorCode.RESULT_CANCELED;
            }
            return originExecuteBlockEvent.bind(executor)(listener);
        };
        const originExecuteTransaction = executor.executeTransaction;
        executor.executeTransaction = async (tx: Transaction, flag?: TransactionExecuteflag): Promise<{err: ErrorCode, receipt?: Receipt}> => {
            if (this.m_cancelSet) {
                this.m_canceled = true;
                return {err: ErrorCode.RESULT_CANCELED};
            }
            return originExecuteTransaction.bind(executor)(tx, flag);
        };
        return {err: ErrorCode.RESULT_OK, executor};
    }
}