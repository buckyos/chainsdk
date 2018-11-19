# type valueChainDebuger
## method createIndependSession
```typescript
createIndependSession(loggerOptions: {console: boolean, file?: {root: string, filename?: string}, level?: string}, dataDir: string): Promise<{err: ErrorCode, session?: ValueIndependDebugSession}>;
```
创建独立调试session，用于开发阶段调试handler代码</p>
参数
+ loggerOptions
    + console 是否输出日志到控制台
    + file 
        + root 日志文件所在目录
        + filename 日志文件前缀名
    + level debug|info|warn|error其一，指定输出日志级别
+ dataDir 指定要调试应用的实例数据目录，也可以是其发布目录

返回值
+ err 错误码，0为成功
+ session [ValueIndependDebugSession](#ValueIndependDebugSession)实例

# <a name="ValueIndependDebugSession">class ValueIndependDebugSession</a>
独立调试session，每个session实例不共享数据
## method init
```typescript
init(options: {
        height: number, 
        accounts: Buffer[] | number, 
        coinbase: number,
        interval: number,
        preBalance?: BigNumber
    }): Promise<ErrorCode>;
```
初始化session，必须先于其他任何method调用之前调用
参数
+ options
    + height 初始化之后的块高度
    + accounts 若为Buffer数组，每个元素为合法的私钥；若为number，则会创建指定个数的新密钥对。此后可通过index索引到地址和私钥。
    + coinbase 初始化的块时，指定块的coinbase为该值索引的地址
    + interval 块的时间间隔，指定块的timestamp增量
    + preBalance 指定每个地址的上的初始余额

返回值

## method updateHeightTo
```typescript
updateHeightTo(height: number, coinbase: number, events?: boolean): ErrorCode;
```
推进当前session到达新的块高度
参数
+ height 要推进到的块高度
+ coinbase 指定块的coinbase为该值索引的地址
+ events 推进中产生的块是否执行handler中注册的事件响应，默认为false

返回值
错误码，0为成功

## method transaction
```typescript
transaction(options: {caller: number|Buffer, method: string, input: any, value: BigNumber, fee: BigNumber}): Promise<{err: ErrorCode, receipt?: Receipt}>;
```
在当前上下文上执行新的transaction
参数
+ options
    + caller 指定transaction的发起者，若为Buffer，指定合法的私钥；若为number，则为init中创建的accounts索引
    + method 指定交易类型
    + input 指定交易的参数
    + value 指定交易的value值
    + fee 指定交易的fee值
    + nonce 指定交易的nonce，在independSession中执行transaction时会忽略transaction的nonce，所以可以忽略该参数；但是如果在交易的响应中调用了createAddress，因为创建新的address的算法依赖nonce值，就必须为每个transaction指定不同的nonce值
返回值
+ err 执行的错误码，0为成功
+ receipt 执行交易返回的receipt

## method wage
```typescript
wage(): Promise<{err: ErrorCode}>;
```
在当前上下文执行wage listener
返回值
执行错误码，0为成功

## method view
```typescript
view(options: {method: string, params: any}): Promise<{err: ErrorCode, value?: any}>;
```
在当前上下文执行view method
参数
+ options
    + method 指定view类型
    + params 指定参数

返回值
+ err 执行的错误码，0为成功
+ value view返回值

## method getAccount
```typescript
getAccount(index: number): string;
```
获取在init中注册的accounts中index索引的地址
参数
+ index accounts的索引

返回值
返回accounts中index索引的地址
