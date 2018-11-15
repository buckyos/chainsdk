# class ChainClient
## constructor
```typescript
constructor(options: {host: string, port: number})
```
参数
+ options
    + host
    + port

## method getBlock
```typescript
getBlock(params: {which: string|number|'lastest', transactions?: boolean}): Promise<{err: ErrorCode, block?: any}>;
```
参数
+ params
    + which
    + transactions

返回值
+ err
+ block
    + number

## event tipBlock
```typescript
on(event: 'tipBlock', listener: (block: any) => void): this;
```
参数
+ block
    + number

# class ValueTransaction