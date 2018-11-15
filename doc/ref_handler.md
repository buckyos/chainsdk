# <a name="ValueHandler">class ValueHandler</a>
## member genesisListener: 

## method addTX
```typescript
addTX(name: string, listener: TxListener, checker?: TxPendingChecker)
```
注册transaction的响应函数
参数
+ name 名称
+ listener [处理函数](#TxListener)
+ checker [检查函数](#TxPendingChecker)

## method addViewMethod
```typescript
addViewMethod(name: string, listener: ViewListener)
```
注册view的响应函数
参数
+ name
+ listener

# <a name="TxListener">type TxListener</a>
```typescript
type TxListener = (context: any, params: any) => Promise<ErrorCode>;
```
参数
+ context
+ params

返回值

# <a name="TxPendingChecker">type TxPendingChecker</a>
```typescript
type TxPendingChecker = (tx: Transaction) => ErrorCode;
```
参数
+ tx

返回值
