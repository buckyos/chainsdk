import {ErrorCode, BigNumber, DposViewContext, DposTransactionContext, DposEventContext, ValueHandler, IReadableKeyValue, MapToObject} from '../../../src/client';
import {isNullOrUndefined} from 'util';

export function registerHandler(handler: ValueHandler) {
    handler.genesisListener = async (context: DposTransactionContext) => {
        await context.storage.createKeyValue('bid');
        await context.storage.createKeyValue('bidInfo');
        return ErrorCode.RESULT_OK;
    };

    async function getTokenBalance(balanceKv: IReadableKeyValue, address: string): Promise<BigNumber> {
        let retInfo = await balanceKv.get(address);
        return retInfo.err === ErrorCode.RESULT_OK ? retInfo.value : new BigNumber(0);
    }

    handler.addTX('createToken', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        // 这里是不是会有一些检查什么的，会让任何人都随便创建Token么?

        // 必须要有tokenid，一条链上tokenid不能重复
        if (!params.tokenid) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }
        let kvRet = await context.storage.createKeyValue(params.tokenid);
        if (kvRet.err) {
            return kvRet.err;
        }

        await kvRet.kv!.set('creator', context.caller);

        if (params.preBalances) {
            for (let index = 0; index < params.preBalances.length; index++) {
                // 按照address和amount预先初始化钱数
                await kvRet.kv!.set(params.preBalances[index].address, new BigNumber(params.preBalances[index].amount));
            }
        }
        return ErrorCode.RESULT_OK;
    });

    handler.addTX('transferTokenTo', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        let tokenkv = await context.storage.getReadWritableKeyValue(params.tokenid);
        if (tokenkv.err) {
            return tokenkv.err;
        }

        let fromTotal = await getTokenBalance(tokenkv.kv!, context.caller);
        let amount = new BigNumber(params.amount);
        if (fromTotal.lt(amount)) {
            return ErrorCode.RESULT_NOT_ENOUGH;
        }
        await (tokenkv.kv!.set(context.caller, fromTotal.minus(amount)));
        await (tokenkv.kv!.set(params.to, (await getTokenBalance(tokenkv.kv!, params.to)).plus(amount)));
        return ErrorCode.RESULT_OK;
    });

    handler.addViewMethod('getTokenBalance', async (context: DposViewContext, params: any): Promise<BigNumber> => {
        let balancekv = await context.storage.getReadableKeyValue(params.tokenid);
        return await getTokenBalance(balancekv.kv!, params.address);
    });
    
    handler.addViewMethod('getBalance', async (context: DposViewContext, params: any): Promise<BigNumber> => {
        return await context.getBalance(params.address);
    });
    
    handler.addViewMethod('getVote', async (context: DposViewContext, params: any): Promise<any> => {
        let v: Map<string, BigNumber> = await context.getVote();
        return MapToObject(v);
    });
    
    handler.addViewMethod('getStake', async (context: DposViewContext, params: any): Promise<BigNumber> => {
        return await context.getStake(params.address);
    });
    
    handler.addViewMethod('getCandidates', async (context: DposViewContext, params: any): Promise<string[]> => {
        return await context.getCandidates();
    });

    handler.addViewMethod('getMiners', async (context: DposViewContext, params: any): Promise<string[]> => {
        return await context.getMiners();
    });
    
    handler.addTX('transferTo', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        return await context.transferTo(params.to, context.value);
    });
    
    handler.addTX('vote', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        return await context.vote(context.caller, params);
    });
    
    handler.addTX('mortgage', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        return await context.mortgage(context.caller, new BigNumber(params));
    });
    
    handler.addTX('unmortgage', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        let err = await context.transferTo(context.caller, new BigNumber(params));
        if (err) {
            return err;
        }
        return await context.unmortgage(context.caller, new BigNumber(params));
    });
    
    handler.addTX('register', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        return await context.register(context.caller);
    });

    // 拍卖
    handler.addTX('publish', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        // params.name: 发布的name, name不能相同
        // context.value: 最低出价, BigNumber
        // params.duation: 持续时间，单位是block

        // 暂时没有对发布方有value的要求，可以加上发布方要扣除一定数量币的功能
        if (isNullOrUndefined(params.name) || !params.duation || params.duation <= 0 || !(params.lowest instanceof BigNumber)) {
            return ErrorCode.RESULT_INVALID_PARAM;
        }

        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv!;
        let ret = await bidKV.get(params.name);
        if (ret.err === ErrorCode.RESULT_OK) {
            return ErrorCode.RESULT_ALREADY_EXIST;
        }
        let bidInfoKV = (await context.storage.getReadWritableKeyValue('bidInfo')).kv!;
        await bidInfoKV.hset('biding', params.name, {publisher: context.caller, finish: context.height + params.duation});
        await bidKV.set(params.name, {caller: context.caller, value: context.value});
        await bidKV.rpush((context.height + params.duation).toString(), params.name);
        return ErrorCode.RESULT_OK;
    });

    // 出价
    handler.addTX('bid', async (context: DposTransactionContext, params: any): Promise<ErrorCode> => {
        context.cost(context.fee);
        // params.name: 发布的name, name不能相同
        // context.value: 最低出价, BigNumber
        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv!;
        let ret = await bidKV.get(params.name);
        if (ret.err !== ErrorCode.RESULT_OK) {
            return ret.err;
        }
        // 如果本次出价不高于上次，则无效
        if ((ret.value!.value as BigNumber).gte(context.value)) {
            return ErrorCode.RESULT_NOT_ENOUGH;
        }
        // 把上一次的出价还给出价者
        await context.transferTo(ret.value!.caller, ret.value!.value);
        // 更新新的出价
        await bidKV.set(params.name, {caller: context.caller, value: context.value});
        return ErrorCode.RESULT_OK;
    });

    // 在块后事件中处理拍卖结果
    handler.addPostBlockListener(async (height: number): Promise < boolean > => true, 
    async (context: DposEventContext): Promise<ErrorCode> => {
        context.logger.info(`on BlockHeight ${context.height}`);
        let bidKV = (await context.storage.getReadWritableKeyValue('bid')).kv!;
        let bidInfoKV = (await context.storage.getReadWritableKeyValue('bidInfo')).kv!;
        do {
            let ret = await bidKV.rpop(context.height.toString());
            if (ret.err === ErrorCode.RESULT_OK) {
                const name = ret.value;
                let info = (await bidInfoKV.hget('biding', name)).value!;
                const lastBid = (await bidKV.get(name)).value;
                if (lastBid.caller !== info.publisher) {    //  否则流标
                    await context.transferTo(info.publisher, lastBid.value);
                    // 存储本次拍卖的结果
                    info.owner = lastBid.caller;
                    info.value = lastBid.value;
                } 
                await bidInfoKV.hdel('biding', name);
                await bidInfoKV.hset('finish', name, info);
                // 清理掉不需要的数据
                await bidKV.hclean(name);
            } else {
                break;
            }
        } while (true);
        return ErrorCode.RESULT_OK;
    });

    // 查询指定name的拍卖信息
    handler.addViewMethod('GetBidInfo', async (context: DposViewContext, params: any): Promise<any> => {
        let value: any = {};
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv!;
        let bidKV = (await context.storage.getReadableKeyValue('bid')).kv!;
        let bid = await bidKV.get(params.name);
        let bidInfo = await bidInfoKV.hget(bid.err === ErrorCode.RESULT_NOT_FOUND ? 'finish' : 'biding', params.name);
        if (bidInfo.err !== ErrorCode.RESULT_OK) {
            return;
        }
        value = bidInfo.value!;
        value.name = params.name;
        if (!bidInfo.value!.owner) {
            value.bidder = bid.value!.caller;
            value.bidvalue = bid.value!.value;
        }

        return value;
    });

    // 查询所有正在拍卖的name的信息
    handler.addViewMethod('GetAllBiding', async (context: DposViewContext, params: any): Promise<any[]> => {
        let ret: any[] = [];
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv!;
        let bidKV = (await context.storage.getReadableKeyValue('bid')).kv!;
        let rets = await bidInfoKV.hgetall('biding');
        if (rets.err === ErrorCode.RESULT_OK) {
            for (const {key, value} of rets.value!) {
                let i = value;
                i.name = key;
                let bid = await bidKV.get(key);
                i.bidder = bid.value!.caller;
                i.bidvalue = bid.value!.value;
                ret.push(i);
            }
        }
        return ret;
    });

    // 查询所有拍卖完成name的信息
    handler.addViewMethod('GetAllFinished', async (context: DposViewContext, params: any): Promise<any[]> => {
        let ret: any[] = [];
        let bidInfoKV = (await context.storage.getReadableKeyValue('bidInfo')).kv!;
        let rets = await bidInfoKV.hgetall('finish');
        if (rets.err === ErrorCode.RESULT_OK) {
            for (const {key, value} of rets.value!) {
                let i = value;
                i.name = key;
                ret.push(i);
            }
        }
        return ret;
    });
}
