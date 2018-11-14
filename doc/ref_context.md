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
创建一个可以读写的 key-value对象
```typescript
// @param name 对象名字 类似表名
createKeyValue(name: string): Promise<{err: ErrorCode, kv?: IReadWritableKeyValue}>;
```

## method getReadWritableKeyValue
获取一个只写的数据存储对象
```typescript
// @param name 对象名字 类似表名
getReadWritableKeyValue(name: string): Promise<{ err: ErrorCode, kv?: IReadWritableKeyValue }>;
```

# interface IWritableKeyValue
可写的 key-value对象

+ ps: 以下的函数可参照redis主要方法的使用方式

## method set
```typescript
set(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method hset
```typescript
hset(key: string, field: string, value: any): Promise<{ err: ErrorCode }>;
```

## method hmset
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
```typescript
lset(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
```

## method lpush
```typescript
lpush(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method lpushx
```typescript
lpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
```

## method lpop
```typescript
lpop(key: string): Promise<{ err: ErrorCode, value?: any }>;
```

## method rpush
```typescript
rpush(key: string, value: any): Promise<{ err: ErrorCode }>;
```

## method rpushx
```typescript
rpushx(key: string, value: any[]): Promise<{ err: ErrorCode }>;
```

## method rpop
```typescript
rpop(key: string): Promise<{ err: ErrorCode, value?: any }>;
```

## method linsert
```typescript
linsert(key: string, index: number, value: any): Promise<{ err: ErrorCode }>;
```

## method lremove
```typescript
lremove(key: string, index: number): Promise<{ err: ErrorCode, value?: any }>;
```


