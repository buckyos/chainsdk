# <a name="ValueHandler">class ValueHandler</a>
## member genesisListener: 
函数原型
```typescript
(context: any) => Promise<ErrorCode>
```
该函数用于初始化链时设置自定义信息，在调用host的create功能时被调用，返回0表示成功初始化，返回非0值会让create操作失败

## method addTX
```typescript
addTX(name: string, listener: TxListener, checker?: TxPendingChecker)
```
注册transaction的响应函数，每个tx在上链之前都会调用对应name的listener处理函数，产生一个receipt

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
+ name 名称
+ listener [处理函数](#ViewListener)

# <a name="TxListener">type TxListener</a>
```typescript
type TxListener = (context: any, params: any) => Promise<ErrorCode>;
```
参数
+ context 链的context对象，详情见ref_context.md文件
+ params transcation的input参数

返回值

返回0表示操作成功，返回其他值表示操作失败。<b>无论返回任何值，该tx都会上链</b>，返回值会记录在该tx对应的receipt中

# <a name="TxPendingChecker">type TxPendingChecker</a>
```typescript
type TxPendingChecker = (tx: Transaction) => ErrorCode;
```

用于判定一个transcation是否应该上链

参数
+ tx 需要判定的transcation, 该transcation的类型为Transaction的实际派生类型，与链共识有关

返回值

返回0表示该transcation可以上链，返回非0值表示该tx不应该上链，会被直接抛弃

# <a name="ViewListener">type ViewListener</a>
```typescript
type ViewListener = (context: any, params: any) => Promise<any>;
```

view method的响应函数，client的view调用和chain的view调用会触发对应method的ViewListener

参数

+ context 链的viewcontext对象，详情见ref_context.md文件
+ params view的params参数

返回值

允许返回任意能序列化的对象