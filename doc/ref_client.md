# class ChainClient
## constructor
```typescript
constructor(options: {host: string, port: number})
```
创建一个Chain Client对象，用于与开启了rpc监听的host通信，<b>以下的各种数据获取函数都基于host本地的数据</b>

参数
+ options
    + host host绑定的RPC监听ip，启动host时用rpchost参数指定
    + port host绑定的RPC监听端口，启动host时用rpcport参数指定

## method getBlock
```typescript
getBlock(params: {which: string|number|'lastest', transactions?: boolean}): Promise<{err: ErrorCode, block?: any, txs?: any[]}>;
```
从host上取链上指定的块头信息

参数
+ params
    + which 可以传入字符串格式的块hash，数字格式的块高度，或```'lastest'```字符串
    + transactions 取块信息是是否也要块内所有transcation的信息，填入true时函数返回会变慢

返回值
+ err 此次调用的错误码，错误码为0时表示成功取回，错误码非0时，不存在其他字段
+ block 对应的块头信息，以Object形式展现，不同共识的链块头信息各有不同
+ txs 当调用时transactions参数为true时，返回该字段，该字段为数组，表示块内包含的所有transcation的信息，以Object形式展现

## method getTransactionReceipt
```typescript
getTransactionReceipt(params: {tx: string}): Promise<{err: ErrorCode, block?: any, tx?: any, receipt?: any}>
```
从host上取指定tx的receipt信息

参数
+ params
    + tx 字符串格式的tx hash

返回值
+ err 此次调用的错误码，错误码为0时表示成功取回，错误码非0时，不存在其他字段
+ block 该tx所在block的块头信息
+ tx 该tx的信息
+ receipt 该tx对应的receipt信息

## method getNonce
```typescript
getNonce(params: {address: string}): Promise<{err: ErrorCode, nonce?: number}>
```
从host上取指定地址的最新nonce

参数
+ params
    + address 字符串格式的地址

返回值
+ err 此次调用的错误码，错误码为0时表示成功取回，错误码非0时，不存在其他字段
+ nonce 该地址在链上的最新nonce，当地址没有发送过任何tx时，返回-1

## method sendTransaction
```typescript
sendTransaction(params: {tx: ValueTransaction}): Promise<{err: ErrorCode}>
```
将一个已签名的transcation发送到host，<b>即使该调用返回0错误码，也不表示这个tx已经上链</b>

参数
+ params
    + tx ValueTransaction或其派生类型的对象

返回值
+ err 此次调用的错误码，错误码为0时表示成功发送到host

## method view
```typescript
view(params: {method: string, params: any, from?: number|string|'latest'}): Promise<{err: ErrorCode, value?: any}>
```
从host读取自定义数据，会根据method的值调用handler中对应的View函数

参数
+ params
    + method 加入到handler中的对应View函数名
    + params 函数需要的参数
    + from 指定读取链上哪个高度位置的数据，可传入数字格式的块高度、字符串格式的块Hash、或```'latest'```表示host上的最新高度。不指定该参数时的默认值为```'latest'```

返回值
+ err 此次调用的错误码，错误码为0时表示成功
+ value method对应的View函数返回的内容

## method getPeers
```typescript
getPeers(): Promise<string[]>
```
获取该host已经连接上的所有peer列表，通常用于诊断连接问题

参数
+ 无

返回值

+ 返回数组格式的peerid列表，表示该host当前连接的所有其他节点

## event tipBlock
```typescript
on(event: 'tipBlock', listener: (block: any) => void): this;
```
每当host有块高度变动时，触发该事件。该事件最多每10秒钟触发一次

参数
+ block host最新高度的块头信息

# class ValueTransaction