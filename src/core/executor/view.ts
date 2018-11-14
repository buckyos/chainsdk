import {ErrorCode} from '../error_code';
import {BaseHandler, ViewListener} from './handler';
import {Chain, BlockHeader, IReadableStorage} from '../chain';
import { LoggerInstance } from '../lib/logger_util';

export type ViewExecutorOptions = {
    header: BlockHeader, 
    storage: IReadableStorage, 
    handler: BaseHandler,
    method: string, 
    param: any,
    logger: LoggerInstance,
    externContext: any
};

export class ViewExecutor {
    protected m_handler: BaseHandler;
    protected m_method: string;
    protected m_param: any;
    protected m_externContext: any;
    protected m_header: BlockHeader; 
    protected m_storage: IReadableStorage; 
    protected m_logger: LoggerInstance;

    constructor(options: ViewExecutorOptions) {
        this.m_handler = options.handler;
        this.m_method = options.method;
        this.m_param = options.param;
        this.m_externContext = options.externContext;
        this.m_header = options.header;
        this.m_storage = options.storage;
        this.m_logger = options.logger;
    }

    public get externContext(): any {
        return this.m_externContext;
    }

    protected async prepareContext(blockHeader: BlockHeader, storage: IReadableStorage, externContext: any): Promise<any> {
        let database = (await storage.getReadableDataBase(Chain.dbUser)).value!;
        let context = Object.create(externContext);
        // context.getNow = (): number => {
        //     return blockHeader.timestamp;
        // };

        Object.defineProperty(
            context, 'now', {
                writable: false,
                value: blockHeader.timestamp
            } 
        );
        
        // context.getHeight = (): number => {
        //     return blockHeader.number;
        // };

        Object.defineProperty(
            context, 'height', {
                writable: false,
                value: blockHeader.number
            } 
        );

        // context.getStorage = (): IReadWritableKeyValue => {
        //     return kv;
        // }

        Object.defineProperty(
            context, 'storage', {
                writable: false,
                value: database
            } 
        );

        Object.defineProperty(
            context, 'logger', {
                writable: false,
                value: this.m_logger
            } 
        );
        return context;
    }

    public async execute(): Promise<{err: ErrorCode, value?: any, methods?: Array<string>}>  {
        let fcall: ViewListener|undefined =  this.m_handler.getViewMethod(this.m_method);
        if (!fcall) {
            // 找不到view method时, 错误日志里列出全部可选的method
            let methods = this.m_handler.getViewMethodNames();
            this.m_logger.error(`view execute getViewMethod fail, method=${this.m_method}; suport methods [${methods.join(',')} ]`);
            return {err: ErrorCode.RESULT_NOT_SUPPORT, methods};    
        }
        let context = await this.prepareContext(this.m_header, this.m_storage, this.m_externContext);
       
        try {
            this.m_logger.info(`will execute view method ${this.m_method}, params ${JSON.stringify(this.m_param)}`);
            let v: any = await fcall(context, this.m_param);
            return {err: ErrorCode.RESULT_OK, value: v};
        } catch (error) {
            return {err: ErrorCode.RESULT_EXCEPTION};
        }
    }
}