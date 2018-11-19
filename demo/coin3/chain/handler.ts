import {ErrorCode, BigNumber, DbftViewContext, DbftTransactionContext, ValueHandler} from '../../../src/client';

export function registerHandler(handler: ValueHandler) {
    handler.addViewMethod('getBalance', async (context: DbftViewContext, params: any): Promise<BigNumber> => {
        return await context.getBalance(params.address);
    });
    
    handler.addViewMethod('getMiners', async (context: DbftViewContext, params: any): Promise<{address: string, pubkey: string}[]> => {
        return await context.getMiners();
    });
    
    handler.addViewMethod('isMiner', async (context: DbftViewContext, params: any): Promise<boolean> => {
        return await context.isMiner(params.address);
    });
    
    handler.addTX('transferTo', async (context: DbftTransactionContext, params: any): Promise<ErrorCode> => {
        return await context.transferTo(params.to, context.value);
    });
    
    handler.addTX('register', async (context: DbftTransactionContext, params: any): Promise<ErrorCode> => {
        return await context.register(context.caller, params.address);
    });
    
    handler.addTX('unregister', async (context: DbftTransactionContext, params: any): Promise<ErrorCode> => {
        return await context.unregister(context.caller, params.address);
    });
}