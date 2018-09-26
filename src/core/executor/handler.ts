import {ErrorCode} from '../error_code';
import {Transaction} from '../block';

export type TxListener = (context: any, params: any) => Promise<ErrorCode>;
export type TxPendingChecker = (tx: Transaction) => ErrorCode;
export type BlockHeigthFilter = (height: number) => Promise<boolean>;
export type BlockHeightListener = (context: any) => Promise<ErrorCode>;
export type ViewListener = (context: any, params: any) => Promise<any>;

export class BaseHandler {
    protected m_txListeners: Map<string, {listener: TxListener, checker?: TxPendingChecker}> = new Map();
    protected m_viewListeners: Map<string, ViewListener> = new Map();
    protected m_preBlockListeners: {filter: BlockHeigthFilter, listener: BlockHeightListener}[] = [];
    protected m_postBlockListeners: {filter: BlockHeigthFilter, listener: BlockHeightListener}[] = [];
    
    constructor() {
    }

    public genesisListener?: BlockHeightListener;

    public addTX(name: string, listener: TxListener, checker?: TxPendingChecker) {
        if (name.length > 0 && listener) {
            this.m_txListeners.set(name, {listener, checker});
        }
    }
    
    public getTxListener(name: string): TxListener|undefined {
        const stub = this.m_txListeners.get(name);
        if (!stub) {
            return undefined;
        }
        return stub.listener;
    }

    public getTxPendingChecker(name: string): TxPendingChecker|undefined {
        const stub = this.m_txListeners.get(name);
        if (!stub) {
            return undefined;
        }
        if (!stub.checker) {
            return (tx: Transaction) => ErrorCode.RESULT_OK;
        }
        return stub.checker;
    }

    public addViewMethod(name: string, listener: ViewListener) {
        if (name.length > 0 && listener) {
            this.m_viewListeners.set(name, listener);
        }
    }

    public getViewMethod(name: string): ViewListener|undefined {
        return this.m_viewListeners.get(name) as ViewListener;
    }

    public addPreBlockListener(filter: BlockHeigthFilter, listener: BlockHeightListener) {
        this.m_preBlockListeners.push({filter, listener});
    }

    public addPostBlockListener(filter: BlockHeigthFilter, listener: BlockHeightListener) {
        this.m_postBlockListeners.push({filter, listener});
    }

    public getPreBlockListeners(h: number): BlockHeightListener[] {
        let listeners = [];
        for (let l of this.m_preBlockListeners) {
            if (l.filter(h)) {
                listeners.push(l.listener);
            }
        }
        return listeners;
    }

    public getPostBlockListeners(h: number): BlockHeightListener[] {
        let listeners = [];
        for (let l of this.m_postBlockListeners) {
            if (l.filter(h)) {
                listeners.push(l.listener);
            }
        }
        return listeners;
    }
}