[TOC]
# 命令行格式
> create|miner|peer --option [value] [--option [value], ...]

# <a name="create">create 命令</a> 
+ 从应用包创建genesis发布包
> create --package $path --dataDir $path --genesisConfig $path \[--externalHandler\] \[--loggerConsole\]  \[--loggerLevel debug|info|warn|error\]
+ 选项
    + package 应用包路径
    + dataDir genesis发布包的输出路径
    + genesisConfig genesis配置文件路径
    + externalHandler 如果应用使用非原生javascript语言编写（比如typescript），发布时需要首先编译为javascript代码，为了调试方便需要保持运行时加载的javascript文件路径不变（匹配codemap才能映射到正确的typescript源码）；当指定externalHandler选项时，不会拷贝应用包中的代码到发布包中，实例运行会直接引用应用包中的代码路径；如果不指定，则会拷贝应用包中的所有代码到发布包，实例运行会引用发布包中的代码路径。所以在开发过程中，一般指定该选项便于调试，向用户发布时，务必不能指定该选项
    + loggerConsole 见[logger](#logger)
    + loggerLevel 见[logger](#logger)

# <a name="miner">miner命令</a>
+ 运行miner实例
> miner --dataDir $path --genesis $path \[--forceclean\] \[--executor inprocess|interprocess\] \[--loggerConsole\] \[--loggerLevel debug|info|warn|error\] \[--net |tcp|bdt\] \[--netoption \] \[--ignoreBan\] \[--feelimit\] \[--rpchost\]\[--rpcport\]
+ 选项
    + genesis genesis发布包路径
    + dataDir 实例的数据目录路径
    + forceclean 如果数据目录已经存在，指定forceclean选项会首先清除数据目录
    + executor 指定实例出块或验证过程中执行transaction的进程模型，inprocess为同进程执行，interprocess为创建子进程执行；默认为inprocess，interprocess在多核cpu硬件上有更好的性能，能够显著提升transaction吞吐量
    + loggerConsole 见[logger](#logger)
    + loggerLevel 见[logger](#logger)
    + net, netoption 见[network](#network)
    + ignoreBan 是否忽略ban操作，带该参数表示忽略，可选
    + feelimit xxx：通过fee限制每个block里面的tx个数，tx的总fee小于等于xxx，必填
    + rpchost： 本地调用host，可选，但是必须和rpcport配对
    + rpcport： 本地调用端口，可选，但是必须和rpchost配对
  
# peer命令
+ 运行peer实例
> peer --dataDir $path --genesis $path \[--forclean\] \[--executor inprocess|interprocess\] \[--loggerConsole\] \[--loggerLevel debug|info|warn|error\] \[--net |tcp|bdt\] \[--netoption \] \[--ignoreBan\] \[--rpchost\]\[--rpcport\]
+ 选项
    + genesis 与[miner](#miner)一致
    + dataDir 与[miner](#miner)一致
    + forceclean 与[miner](#miner)一致
    + executor 与[miner](#miner)一致
    + loggerConsole 见[logger](#logger)
    + loggerLevel 见[logger](#logger)
    + net, netoption 见[network](#network)
    + ignoreBan 与[miner](#miner)一致
    + rpchost： 与[miner](#miner)一致
    + rpcport： 与[miner](#miner)一致

# <a name="logger">日志选项</a>
> --loggerConsole --loggerLevel debug|info|warn|error
+ 选项
    + loggerConsole 指定loggerConsole选项会输出日志到命令行控制台
    + loggerLevel 指定输出日志级别，默认为debug

# <a name="appPackage">应用包</a>
应用开发者编写的应用包
```
---package
   |---config.json
   |---code.js [code.js...]
```

## config.json 
应用包的配置文件
```json
{
    "handler":"./handler.js",
    "type": {
        "consensus":"pow",
        "features":[]
    },
    "global": {
        "retargetInterval":10,
        "targetTimespan":60,
        "basicBits":520159231,
        "limit":"0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    }
}
```
+ handler 指定应用的入口代码文件
+ type
    + consensus pow|dpos|bft 定义应用的共识算法，目前内建支持PoW，DPoS，BFT三种
    + features [f1, f2, ...] 定义应用的各种内建特性开关（开发中），目前需传入空数组
+ global 应用的各种静态配置（比如出块间隔），依consensus不同有所区别，应用发布时写入genesis，不可修改

## <a name="genesis_config">genesis config</a>
genesis块的json配置文件,字段依consensus不同有所区别；同一个应用包可以指定不同的genesis config产生不同的发布包（创世块不同）

```json
{
	"preBalances": [{
			"address": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79",
			"amount": 10000000000
		}, {
			"address": "12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ",
			"amount": 10000
		}, {
			"address": "1LuwjNj8wkqo237N7Gh8nZSSvUa6TZ5ds4",
			"amount": 10000
		}, {
			"address": "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ",
			"amount": 10000
		}, {
			"address": "12LKjfgQW26dQZMxcJdkj2iVP2rtJSzT88",
			"amount": 100000
		}
	],
	"coinbase": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79"
}
```
+ coinbase 指定创世块的coinbase地址
+ preBalance: [{address: $, amount: $}, ...]
指定若干地址始的初始余额

# 发布包
开发者完成应用包的开发后，调用[create](#create)命令创建发布包，将发布包推送至用户后，用户调用[miner或peer](#miner)命令运行应用的一个节点实例

# 实例数据目录
用户调用[miner或peer](#miner)命令运行应用的一个节点实例,实例运行时产生的数据（区块数据，缓存，日志，临时文件等等）会写入数据目录
```
---dataDir
   |---config.json
   |---database
   |---Block
       |---block0, [block1,...]
   |---log
       |---1.log, [2.log,...]
   |---storage
       |---dump
           |---block0, [block1,...]
       |---log
           |---block0, [block1,...]
```
+ config.json，可以不用关注，但是不能随意改变内容
+ database ：链数据库
    + best表： 当前链的header序列
    + headers： 所有收到的header列表
    + miners： 根据best链计算的当前miners信息
    + txview： best里面所有tx列表
+ Block ： 所有block的信息
+ log： 程序参数的日志，info.log为链日志 bdt.XXX: bdt产生日志
+ storage
    + dump：存储best链的block的数据库全备份，因为数据量比较大，只存储部分block的数据，其中的表名称采用命名空间方式，namespace#tablename。
        + __system#balance：系统数据库，用户余额
        + __system#config: 系统配置，各配置参见对应的共识的config.json说明
        + __system#XX共识：对应共识产生的内部数据
        + __system#nonce：各个地址的nonce，类似eth
        + 其他：合约可以创建自己的数据为具体业务服务。
    + log：best链的所有block的redo日志，当dump里面没有某个块的数据库备份的时候可以通过redo重塑。

# <a name="network">network选项</a>
配置实例的网络参数
## 单一网络配置
> --net tcp|bdt [--netoption $, ...]
+ net 指定协议，目前内建支持tcp，bdt
+ 其他选项依据协议不同有所不同

## 多网络配置
> --netConfig $path
复杂部署环境下，存在单个实例接入不同网络的需求，比如miner之间使用一个专用网络，若干miner部署一个peer，该peer接入其他peer网络用于接受广播来的交易，同时该peer也要接入miner网络，用于将接受到的交易转发给miner网络；此时可以通过json配置文件传入一组网络配置

# <a name="tcp">tcp配置</a>
+ --host: 本地ip地址一般填 0.0.0.0
+ --port: 端口
+ --peers：tcp网络一般是测试用，因为没有节点发现功能，所以在组网的时候需要先指定各节点的信息，用分号分割
    + 举例123.123.123.123:8000;124.124.124.124:8000


# <a name="bdt">bdt配置</a>
配置选项
+ --host   本地ip地址一般填 0.0.0.0
+ --port   端口号， 包含tcp和udp的端口号，用 | 分隔 
    + "0|13001"
+ --peerid 节点id, 每个节点特有的，不要重复，某些共识有特别的要求，如dbft以miner的address为peerid
+ --sn     sn节点的连接配置, 包含了sn peerid, ip, tcp和udp端口号
    + SN_PEER_TEST@106.75.173.166@12999@12998
+ --bdt_log_level p2p网络的连接日志, 
    + debug
    + info

# PoW配置
+ config.json global字段
    + retargetInterval: 每次重新计算难度的间隔块，BTC为2016。
    + targetTimespan: 每个难度的理想持续时间，BTC为14 * 24 * 60 * 60,单位秒。
    + basicBits: 初始bits,BTC为486604799， 对应的hash值为'00000000ffff0000000000000000000000000000000000000000000000000000';我们设定为'0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'。
    + limit: 最小难度。
    + 整体配置示例：
    ```json
    {
        "handler":"./handler.js",
        "type": {
            "consensus":"pow",
            "features":[]
        },
        "global": {
            "retargetInterval": 2016,
            "targetTimespan": 1209600,
            "basicBits": "0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            "limit": "0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
        }
    }
    ```
+ genesis config字段
    + 基本参见[genesis config](#genesis_config)
+ peer实例命令行选项 
    + 详细见[peer](#peer)
+ miner实例命令行选项
    + 详细见[miner](#miner)

# DPoS配置
+ config.json global字段
    + minCreateor：参与DPOS的miner最小数量。
    + maxCreateor: 参与DPOS的miner最大数量。
    + reSelectionBlocks: 选举周期，只有在每个周期的时候才会重新统计miner。
    + blockInterval：出块周期，单位秒。
    + timeOffsetToLastBlock: miner举例自己上次出块的时间阈值，超过该时间未出块将被禁用，单位秒。
    + timeBan:禁用时间，单位秒。
    + unbanBlocks:解禁计算周期，单位块。每unbanBlocks进行一次解禁统计。
    + dposVoteMaxProducers：选民在进行投票时，可投的最大候选节点数。
    + maxBlockIntervalOffset: 计算时间槽的偏移，一般填1，单位秒。
    + 整体配置示例：
    ```json
    {
        "handler":"./handler.js",
        "type": {
            "consensus":"dpos",
            "features":[]
        },
        "global": {
            "minCreateor": 2,
            "maxCreateor": 21,
            "reSelectionBlocks": 10,
            "blockInterval": 10,
            "timeOffsetToLastBlock": 122400,
            "timeBan": 2592000,
            "unbanBlocks": 100,
            "dposVoteMaxProducers": 30,
            "maxBlockIntervalOffset": 1
        }
    }
    ```
+ genesis config字段
    + 基本参见[genesis config](#genesis_config)
    + miners: 默认出块的miner序列。
    + candidates: 默认的候选节点序列，建议把默认miner加入候选序列，因为选民投票的时候只能投候选序列中的节点。
    +  整体配置示例：
    ```json
    {
        "preBalances": [{
                "address": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79",
                "amount": 10000000000
            }, {
                "address": "12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ",
                "amount": 10000
            }, {
                "address": "1LuwjNj8wkqo237N7Gh8nZSSvUa6TZ5ds4",
                "amount": 10000
            }, {
                "address": "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ",
                "amount": 10000
            }, {
                "address": "12LKjfgQW26dQZMxcJdkj2iVP2rtJSzT88",
                "amount": 100000
            }
        ],
        "miners": [
            "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79",
            "12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ"
        ],
        "candidates": [
            "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79",
            "12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ",
            "1LuwjNj8wkqo237N7Gh8nZSSvUa6TZ5ds4",
            "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ"
        ],
        "coinbase": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79"
    }
    ```
+ peer实例命令行选项 
    + 详细见[peer](#peer)
+ miner实例命令行选项
    + 详细见[miner](#miner)

# BFT配置
+ config.json global字段
    + minValidator: 参与BFT协商的miner的最小数量。
    + maxValidator: 参与BFT协商的miner的最大数量。
    + reSelectionBlocks: miner更新周期，只有在每个周期的时候才会重新统计超级节点注册的miner。
    + blockInterval：出块周期，单位秒。
    + minWaitBlocksToMiner：从注册的block高度开始，候选节点必须要经过minWaitBlocksToMiner块后才能正式节点，可以设置为0。
        + 举例：reSelectionBlocks：10；minWaitBlocksToMiner：15，某个节点在第99块被注册为候选节点，那么在第100、110高度的时候因为没有间隔15个块所以它不会成为miner，只会在120之后才会成为正式miner。
    + systemPubkey：超级节点的pubkey。
    + superAdmin：超级节点地址。
    + agreeRateNumerator和agreeRateDenominator：和agreeRateNumerator一起组成了确认的百分比。
        + 举例：agreeRateNumerator：2、agreeRateDenominator：3，表示必须要三分之二的节点确认后才能表示块成功。
    + 整体配置示例：
    ```json
    {
        "handler":"./handler.js",
        "type": {
            "consensus":"dbft",
            "features":[]
        },
        "global": {
            "minValidator": 1,
            "maxValidator": 21,
            "reSelectionBlocks": 5,
            "blockInterval": 10,
            "minWaitBlocksToMiner": 1,
            "systemPubkey": "0309d4c1abb011bcbeabd46cdfbd19eb734c7110e6d94cb08d2418ac1251f0421f",
            "superAdmin": "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ",
            "agreeRateNumerator": 2,
            "agreeRateDenominator": 3
        }
    }
    ```
+ genesis config字段
    + 基本参见[genesis config](#genesis_config)
    + miners: 建议只添加超级节点作为初始miner(需要minValidator设置为1)。格式如下：
    ```json
    [
        "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ"
    ]
    ```
    + 整体配置示例：
    ```json
    {
        "preBalances": [{
                "address": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79",
                "amount": 10000000000
            }, {
                "address": "12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ",
                "amount": 10000
            }, {
                "address": "1LuwjNj8wkqo237N7Gh8nZSSvUa6TZ5ds4",
                "amount": 10000
            }, {
                "address": "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ",
                "amount": 10000
            }, {
                "address": "12LKjfgQW26dQZMxcJdkj2iVP2rtJSzT88",
                "amount": 100000
            }
        ],
        "miners": [
            "13CS9dBwmaboedj2hPWx6Dgzt4cowWWoNZ"
        ],
        "coinbase": "1EYLLvMtXGeiBJ7AZ6KJRP2BdAQ2Bof79"
    }
    ```
+ peer实例命令行选项 
    + 详细见[peer](#peer)
+ miner实例命令行选项
    + 详细见[miner](#miner)