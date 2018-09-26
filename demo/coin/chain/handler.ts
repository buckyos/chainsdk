import { ErrorCode, BigNumber, ValueViewContext, ValueTransactionContext, ValueHandler } from '../../../src/client';

export function registerHandler(handler: ValueHandler) {
    handler.addViewMethod('getBalance', async (context: ValueViewContext, params: any): Promise<any> => {
        return await context.getBalance(params.address);
    });

    handler.addTX('transferTo', async (context: ValueTransactionContext, params: any): Promise<ErrorCode> => {
        return await context.transferTo(params.to, context.value);
    });

    handler.onMinerWage(async (): Promise<BigNumber> => {
        return new BigNumber(10000);
    });
}