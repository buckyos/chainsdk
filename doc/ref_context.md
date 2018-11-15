# <a name="ExecutorContext">type ExecutorContext</a>
## member now: number
执行context的block的时间戳

## member height: number
执行context的block的块高度

# type TransactionContext
派生自[ExecutorContext](#ExecutorContext)
## member caller: string
执行交易的地址address

## member storage: IReadWritableDataBase
可读写的数据存储对象

## method emit
创建事件的日志实例
```typescript
// @param name  事件名字
// @param param 其他参数
emit: (name: string, param?: any) => void;
```

## method createAddress
创建一个地址
```typescript
createAddress: () => string;
```

# <a name='#ValueTransactionContext'>type ValueTransactionContext </a>
用作发起tx(交易)的执行环境， 一般作为基类， 被具体的某个共识算法的TransactionContext去继承

## member value: BigNumber
交易额度

## member fee: BigNumber;
手续费

## method getBalance
获取某个地址(钱包)的余额
```typescript
getBalance: (address: string) => Promise<BigNumber>;
```
## method transferTo
转账给某个地址(钱包)
```typescript
transferTo: (address: string, amount: BigNumber) => Promise<ErrorCode>;
```

## method cost
扣除手续费， 如果余额不足是失败
```typescript
cost: (fee: BigNumber) => ErrorCode;
```



# <a name='#ViewContext'>type ViewContext </a>
用来查看storage里数据的执行环境， 一般用作基类，不会单独使用
## member storage: IReadableDataBase


# type ValueViewContext
派生自[ViewContext](#ViewContext)
获得一个查看storage数据(主要是blance)的执行环境
## method  getBalance
获取某个地址(钱包)的余额
``` typescript
// @param address 地址
// @return Promise 余额
getBalance: (address: string) => Promise<BigNumber>
```




# interface IReadableDataBase
接口 只读的数据存储对象

## method getReadableKeyValue
获取一个只读的数据存储对象
```typescript
// @param name 对象名字 类似表名
getReadableKeyValue(name: string) => Promise<{ err: ErrorCode, kv?: IReadableKeyValue }>;
```

# interface IWritableDataBase
接口 只写的数据存储对象

## method createKeyValue
创建一个可以读写的 key-value对象, 可以根据需求和业务划分创建一个或多个key-value storage
```typescript
// @param name 对象名字 类似表名
createKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}>;
```

## example: demo dpos handler.ts中，使用createKeyValue创建了选举和选举信息两个storage
```typescript
    ...
    await context.storage.createKeyValue('bid');
    await context.storage.createKeyValue('bidInfo');
    ...
```

## method getReadWritableKeyValue
获取一个只写的数据存储对象
```typescript
// @param name 对象名字 类似表名
getReadWritableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadWritableKeyValue }>;
```

# interface IWritableKeyValue
可写的 key-value对象

ps: 以下的函数可参照redis主要方法的使用方式

## method set
将值 value 设置到 key

如果 key 已经持有其他值，SET 就覆写旧值，无视类型。
```typescript
set(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method hset
将哈希表 key 中的域 field 的值设为 value 

如果 key 不存在，一个新的哈希表被创建并进行 HSET 操作。

如果域 field 已经存在于哈希表中，旧值将被覆盖。
```typescript
hset(key: string, field: string, value: any): Promise<{ err: ErrorCode }>;
```

## method hmset
同时将多个 field-value (域-值)对设置到哈希表 key 中。

此命令会覆盖哈希表中已存在的域。

如果 key 不存在，一个空哈希表被创建并执行 HMSET 操作。
```typescript
hmset(key: string, fields: string[], values: any[]): Promise<{ err: ErrorCode }>;
```

## method hclean
```typescript
hclean(key: string): Promise<{err: ErrorCode}>;
```

## method hdel
```typescript
hdel(key: string, field: string): Promise<{err: ErrorCode}>;
```

## method lset
将列表 key 下标为 index 的元素的值设置为 value 。

当 index 参数超出范围，或对一个空列表( key 不存在)进行 LSET 时，返回一个错误。
```typescript
lset(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
```

## method lpush
将一个或多个值 value 插入到列表 key 的表头

如果有多个 value 值，那么各个 value 值按从左到右的顺序依次插入到表头

如果 key 不存在，一个空列表会被创建并执行 LPUSH 操作

当 key 存在但不是列表类型时，返回一个错误
```typescript
lpush(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method lpushx
将值 value 插入到列表 key 的表头，当且仅当 key 存在并且是一个列表。

和 LPUSH 命令相反，当 key 不存在时， LPUSHX 命令什么也不做
```typescript
lpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
```

## method lpop
移除并返回列表 key 的头元素

```typescript
lpop(key: string): Promise<{ err: ErrorCode, value?: any }>;
```

## method rpush
将一个或多个值 value 插入到列表 key 的表尾(最右边)

如果有多个 value 值，那么各个 value 值按从左到右的顺序依次插入到表尾

如果 key 不存在，一个空列表会被创建并执行 RPUSH 操作

当 key 存在但不是列表类型时，返回一个错误
```typescript
rpush(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method rpushx
将值 value 插入到列表 key 的表尾，当且仅当 key 存在并且是一个列表

和 RPUSH 命令相反，当 key 不存在时， RPUSHX 命令什么也不做
```typescript
rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
```

## method rpop
移除并返回列表 key 的尾元素
```typescript
rpop(key: string): Promise<{ err: ErrorCode, value?: any }>;
```

## method linsert
将值 value 插入到列表 key 当中，位于值 index 之前或之后。

当 index 不存在于列表 key 时，不执行任何操作。

当 key 不存在时， key 被视为空列表，不执行任何操作。

如果 key 不是列表类型，返回一个错误。
```typescript
linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
```

## method lremove
```typescript
lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
```


