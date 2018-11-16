node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/coin3/genesis" ^
--dataDir "./data/coin3/miner2" ^
--minerSecret c07ad83d2c5627acece18312362271e22d7aeffb6e2a6e0ffe1107371514fdc2 ^
--net bdt --host 127.0.0.1 --port "12313" --peerid 12nD5LgUnLZDbyncFnoFB43YxhSFsERcgQ --sn SN_PEER_DBFT@127.0.0.1@12405@12406 --bdt_log_level info ^
--rpchost localhost --rpcport 18090 ^
--loggerConsole --loggerLevel debug ^
--feelimit 10 